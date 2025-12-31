// FILE: components/home/HomeScreenContainer.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, ScrollView, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeTask,
  deleteTask,
  loadTasks,
  saveTasks,
  Task,
  uncompleteTask,
} from '@/lib/storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { addDays, pickStringParam } from '@/lib/taskDateUtils';

import HomeScreenView, { SectionKey } from './HomeScreenView';
import { UndoData } from './UndoToast';
import { buildHomeSections, getRemindAtFromTask } from './homeSections';
import { parseTaskWhenInput } from './taskWhenParser';

declare global {
  // eslint-disable-next-line no-var
  var __todoReminderPendingNotificationAction:
    | {
        kind: 'change_time';
        taskId: string;
        timeHHmm: string;
        requestedAt: number;
      }
    | undefined;
}

const IMPORTANT_IDS_KEY = '@important_task_ids_v1';

// Must match app/notification.tsx
const SNOOZE_NOTIF_ID_MAP_KEY = '@task_snooze_notif_id_v1';
const SKIP_TODAY_MAP_KEY = '@task_skip_today_v1';

function extractTaskIdFromNotification(req: Notifications.NotificationRequest): string | null {
  const data = (req?.content?.data ?? {}) as any;
  const id = data?.taskId;
  if (typeof id === 'string' && id.length > 0) return id;
  return null;
}

function parseHHmm(input: string): { h: number; m: number } | null {
  const s = input.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  return { h, m };
}

async function readJsonObject(key: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeJsonObject(key: string, obj: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(obj));
}

function roundToMinute(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export default function HomeScreenContainer() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const [importantOrder, setImportantOrder] = useState<string[]>([]);
  const importantOrderRef = useRef<string[]>([]);
  useEffect(() => {
    importantOrderRef.current = importantOrder;
  }, [importantOrder]);

  const importantSet = useMemo(() => new Set(importantOrder), [importantOrder]);

  const [titleText, setTitleText] = useState('');
  const [whenText, setWhenText] = useState('');

  const [titleError, setTitleError] = useState<string | null>(null);
  const [whenError, setWhenError] = useState<string | null>(null);

  const titleInputRef = useRef<TextInput | null>(null);
  const whenInputRef = useRef<TextInput | null>(null);

  const [showImportantModal, setShowImportantModal] = useState(false);

  const [undoData, setUndoData] = useState<UndoData | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

  const [isReady, setIsReady] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const sectionYRef = useRef<{
    late?: number;
    today?: number;
    tomorrow?: number;
    week?: number;
    completed?: number;
  }>({});
  const lastHandledNavIdRef = useRef<string | null>(null);

  const [navToast, setNavToast] = useState<string | null>(null);

  const showNavToast = (message: string): void => {
    setNavToast(message);
    setTimeout(() => {
      setNavToast((curr) => (curr === message ? null : curr));
    }, 2200);
  };

  const navTaskId = useMemo(() => {
    const a = pickStringParam((params as any)?.highlightTaskId);
    const b = pickStringParam((params as any)?.taskId);
    const c = pickStringParam((params as any)?.id);
    return a ?? b ?? c;
  }, [params]);

  const cancelScheduledNotificationsForTaskId = async (taskId: string): Promise<void> => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const targets = scheduled.filter((req) => extractTaskIdFromNotification(req) === taskId);
      await Promise.allSettled(
        targets.map((req) => Notifications.cancelScheduledNotificationAsync(req.identifier))
      );
    } catch {
      // ignore
    }
  };

  const tryScheduleTaskNotification = async (
    task: Task,
    opts?: { requestPermission?: boolean }
  ): Promise<void> => {
    try {
      const remindAt = getRemindAtFromTask(task);
      if (!remindAt) return;

      const nowMinute = new Date();
      nowMinute.setSeconds(0, 0);
      if (remindAt.getTime() < nowMinute.getTime()) return;

      let status = (await Notifications.getPermissionsAsync()).status;
      if (status !== 'granted' && opts?.requestPermission) {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== 'granted') return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Todo Reminder',
          body: task.title,
          data: { taskId: task.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: remindAt,
        },
      });
    } catch {
      // ignore
    }
  };

  const cleanupOrphanedTaskNotifications = async (loadedTasks: Task[]): Promise<void> => {
    try {
      const byId = new Map(loadedTasks.map((t) => [t.id, t]));
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();

      const toCancel: string[] = [];

      for (const req of scheduled) {
        const taskId = extractTaskIdFromNotification(req);
        if (!taskId) continue;

        const t = byId.get(taskId);
        if (!t || t.completed) {
          toCancel.push(req.identifier);
        }
      }

      if (toCancel.length === 0) return;
      await Promise.allSettled(
        toCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id))
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrap = async (): Promise<void> => {
    const t = await loadTasks();
    setTasks(t);

    const idsJson = await AsyncStorage.getItem(IMPORTANT_IDS_KEY);
    if (idsJson) {
      try {
        const ids = JSON.parse(idsJson) as string[];
        if (Array.isArray(ids)) setImportantOrder(ids.filter((x) => typeof x === 'string'));
      } catch {
        // ignore
      }
    }

    await cleanupOrphanedTaskNotifications(t);

    setIsReady(true);
  };

  const persistImportantOrder = async (order: string[]): Promise<void> => {
    setImportantOrder(order);
    await AsyncStorage.setItem(IMPORTANT_IDS_KEY, JSON.stringify(order));
  };

  const toggleImportant = async (id: string): Promise<void> => {
    const isImp = importantSet.has(id);
    if (isImp) {
      const next = importantOrder.filter((x) => x !== id);
      await persistImportantOrder(next);
      return;
    }
    const next = [id, ...importantOrder.filter((x) => x !== id)];
    await persistImportantOrder(next);
  };

  const moveImportant = async (id: string, dir: -1 | 1): Promise<void> => {
    const idx = importantOrder.indexOf(id);
    if (idx === -1) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= importantOrder.length) return;
    const next = [...importantOrder];
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;
    await persistImportantOrder(next);
  };

  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30_000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const sections = useMemo(() => {
    return buildHomeSections({ tasks, now });
  }, [tasks, now]);

  const { todayKey, lateTasks, todayTasks, tomorrowTasks, thisWeekByDay, completedTodayTasks } = sections;

  // eslint-disable-next-line no-console
  console.log('[HomeSections]', {
    todayKey,
    lateCount: lateTasks.length,
    todayCount: todayTasks.length,
    tomorrowCount: tomorrowTasks.length,
  });

  const importantTasks = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const aliveIds = importantOrder.filter((id) => byId.has(id));
    const result: Task[] = aliveIds.map((id) => byId.get(id)!).filter((t) => !t.completed);

    return result;
  }, [tasks, importantOrder]);

  const changeUndoRef = useRef<{
    oldTaskId: string;
    oldTaskSnapshot: Task;
    oldImportantIndex: number | null;
    oldWasImportant: boolean;
    newTaskId: string;
  } | null>(null);

  const actionHandledKeyRef = useRef<string | null>(null);

  const applyNotificationActionIfAny = useCallback(
    async (taskId: string): Promise<void> => {
      const pending = globalThis.__todoReminderPendingNotificationAction;
      const nowMinute = roundToMinute(new Date());

      const currentTasks = tasksRef.current;
      const currentImportantOrder = importantOrderRef.current;

      const findTask = (): Task | null => currentTasks.find((t) => t.id === taskId) ?? null;

      const setTasksAndPersist = async (nextTasks: Task[]): Promise<void> => {
        setTasks(nextTasks);
        await saveTasks(nextTasks);
      };

      const clearPending = (): void => {
        if (globalThis.__todoReminderPendingNotificationAction?.taskId === taskId) {
          globalThis.__todoReminderPendingNotificationAction = undefined;
        }
      };

      // 1) Change time (highest priority)
      if (pending && pending.kind === 'change_time' && pending.taskId === taskId) {
        const key = `change_time:${taskId}:${pending.requestedAt}`;
        if (actionHandledKeyRef.current === key) return;
        actionHandledKeyRef.current = key;

        const oldTask = findTask();
        if (!oldTask) {
          clearPending();
          showNavToast('Task not found');
          return;
        }

        const parsed = parseHHmm(pending.timeHHmm);
        if (!parsed) {
          clearPending();
          showNavToast('Invalid time');
          return;
        }

        const target = new Date(
          nowMinute.getFullYear(),
          nowMinute.getMonth(),
          nowMinute.getDate(),
          parsed.h,
          parsed.m,
          0,
          0
        );

        if (target.getTime() <= nowMinute.getTime()) {
          clearPending();
          showNavToast('Time is in the past');
          return;
        }

        clearPending();

        // Create a new task (today fixed) + auto-complete old
        const newId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const createdAt = new Date().toISOString();
        const newTask: Task = {
          id: newId,
          title: oldTask.title,
          when: target.toISOString(),
          completed: false,
          createdAt,
        };

        const completedAt = new Date().toISOString();
        const oldUpdated: Task = { ...oldTask, completed: true, completedAt };

        const nextTasks = currentTasks.map((t) => (t.id === oldTask.id ? oldUpdated : t)).concat(newTask);

        // Important inheritance: replace old id with new id if needed
        const oldWasImportant = currentImportantOrder.includes(oldTask.id);
        const oldImportantIndex = oldWasImportant ? currentImportantOrder.indexOf(oldTask.id) : null;

        if (oldWasImportant && oldImportantIndex !== null && oldImportantIndex >= 0) {
          const nextImportantOrder = [...currentImportantOrder];
          nextImportantOrder[oldImportantIndex] = newId;
          await persistImportantOrder(nextImportantOrder);
        }

        // Save + notifications
        await cancelScheduledNotificationsForTaskId(oldTask.id);
        await setTasksAndPersist(nextTasks);

        await tryScheduleTaskNotification(newTask, { requestPermission: false });

        // Undo support (reuse the existing "complete" undo UI)
        changeUndoRef.current = {
          oldTaskId: oldTask.id,
          oldTaskSnapshot: { ...oldTask },
          oldImportantIndex,
          oldWasImportant,
          newTaskId: newId,
        };

        setUndoData({ action: 'complete', task: oldTask } as unknown as UndoData);
        setTimeout(() => {
          setUndoData((curr) => {
            const isSame =
              (curr as any)?.action === 'complete' && (curr as any)?.task?.id === oldTask.id;
            if (isSame) {
              changeUndoRef.current = null;
              return null;
            }
            return curr;
          });
        }, 5000);

        router.replace({ pathname: '/', params: { highlightTaskId: newId } });
        return;
      }

      // 2) Skip today map (move to tomorrow same time)
      try {
        const skipMap = await readJsonObject(SKIP_TODAY_MAP_KEY);
        const skipKey = skipMap[taskId];

        if (skipKey) {
          if (skipKey !== todayKey) {
            delete skipMap[taskId];
            await writeJsonObject(SKIP_TODAY_MAP_KEY, skipMap);
          } else {
            const key = `skip_today:${taskId}:${skipKey}`;
            if (actionHandledKeyRef.current === key) return;
            actionHandledKeyRef.current = key;

            const t = findTask();
            if (!t) {
              delete skipMap[taskId];
              await writeJsonObject(SKIP_TODAY_MAP_KEY, skipMap);
              showNavToast('Task not found');
              return;
            }

            const remindAt = getRemindAtFromTask(t);
            if (!remindAt) {
              delete skipMap[taskId];
              await writeJsonObject(SKIP_TODAY_MAP_KEY, skipMap);
              showNavToast('Task not found');
              return;
            }

            const nextRemindAt = addDays(remindAt, 1);
            nextRemindAt.setSeconds(0, 0);

            const updated: Task = { ...t, when: nextRemindAt.toISOString() };
            const nextTasks = currentTasks.map((x) => (x.id === t.id ? updated : x));

            await cancelScheduledNotificationsForTaskId(t.id);
            await setTasksAndPersist(nextTasks);
            await tryScheduleTaskNotification(updated, { requestPermission: false });

            delete skipMap[taskId];
            await writeJsonObject(SKIP_TODAY_MAP_KEY, skipMap);

            router.replace({ pathname: '/', params: { highlightTaskId: t.id } });
            return;
          }
        }
      } catch {
        // ignore
      }

      // 3) Snooze map (move to now+10min and make Home reflect it)
      try {
        const snoozeMap = await readJsonObject(SNOOZE_NOTIF_ID_MAP_KEY);
        const snoozeNotifId = snoozeMap[taskId];

        if (snoozeNotifId) {
          const key = `snooze:${taskId}:${snoozeNotifId}`;
          if (actionHandledKeyRef.current === key) return;
          actionHandledKeyRef.current = key;

          const t = findTask();
          if (!t) {
            delete snoozeMap[taskId];
            await writeJsonObject(SNOOZE_NOTIF_ID_MAP_KEY, snoozeMap);
            showNavToast('Task not found');
            return;
          }

          const nextRemindAt = roundToMinute(addMinutes(new Date(), 10));

          const updated: Task = { ...t, when: nextRemindAt.toISOString() };
          const nextTasks = currentTasks.map((x) => (x.id === t.id ? updated : x));

          await cancelScheduledNotificationsForTaskId(t.id);
          await setTasksAndPersist(nextTasks);
          await tryScheduleTaskNotification(updated, { requestPermission: false });

          delete snoozeMap[taskId];
          await writeJsonObject(SNOOZE_NOTIF_ID_MAP_KEY, snoozeMap);

          router.replace({ pathname: '/', params: { highlightTaskId: t.id } });
          return;
        }
      } catch {
        // ignore
      }
    },
    [router, todayKey]
  );

  useEffect(() => {
    if (!isReady) return;
    if (!navTaskId) return;
    void applyNotificationActionIfAny(navTaskId);
  }, [applyNotificationActionIfAny, isReady, navTaskId]);

  useEffect(() => {
    if (!isReady) return;
    const id = navTaskId;
    if (!id) return;

    if (lastHandledNavIdRef.current === id) return;
    lastHandledNavIdRef.current = id;

    const isInLate = lateTasks.some((x) => x.task.id === id);
    const isInToday = todayTasks.some((x) => x.task.id === id);
    const isInTomorrow = tomorrowTasks.some((x) => x.task.id === id);
    const isInCompletedToday = completedTodayTasks.some((t) => t.id === id);

    let isInWeek = false;
    if (!isInLate && !isInToday && !isInTomorrow && !isInCompletedToday) {
      for (const k of Object.keys(thisWeekByDay)) {
        if (thisWeekByDay[k]?.some((x) => x.task.id === id)) {
          isInWeek = true;
          break;
        }
      }
    }

    const isVisible = isInLate || isInToday || isInTomorrow || isInWeek || isInCompletedToday;

    if (!isVisible) {
      showNavToast('Task not found');
      return;
    }

    Keyboard.dismiss();
    setHighlightTaskId(id);

    const clearAfterMs = 2200;
    setTimeout(() => {
      setHighlightTaskId((prev) => (prev === id ? null : prev));
    }, clearAfterMs);

    let targetY: number | undefined;

    if (isInLate) targetY = sectionYRef.current.late;
    else if (isInToday) targetY = sectionYRef.current.today;
    else if (isInTomorrow) targetY = sectionYRef.current.tomorrow;
    else if (isInWeek) targetY = sectionYRef.current.week;
    else if (isInCompletedToday) targetY = sectionYRef.current.completed;

    if (typeof targetY === 'number') {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 10), animated: true });
      });
    }
  }, [isReady, navTaskId, lateTasks, todayTasks, tomorrowTasks, thisWeekByDay, completedTodayTasks]);

  const clearInputErrors = (): void => {
    setTitleError(null);
    setWhenError(null);
  };

  const handleAdd = async (): Promise<void> => {
    clearInputErrors();

    const title = titleText.trim();
    if (!title) {
      setTitleError('Required');
      return;
    }

    const whenParsed = parseTaskWhenInput(whenText);
    if (!whenParsed.ok) {
      setWhenError(whenParsed.error);
      return;
    }

    const remindAt = whenParsed.remindAt;

    const created: Task = {
      id: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title,
      when: remindAt.toISOString(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    const next = [...tasksRef.current, created];
    setTasks(next);
    await saveTasks(next);

    await tryScheduleTaskNotification(created, { requestPermission: true });

    setTitleText('');
    setWhenText('');
    Keyboard.dismiss();

    setHighlightTaskId(created.id);
    setTimeout(() => {
      setHighlightTaskId((prev) => (prev === created.id ? null : prev));
    }, 1600);

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const handleComplete = async (task: Task): Promise<void> => {
    if (task.completed) {
      await uncompleteTask(task.id);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: false, completedAt: undefined } : t))
      );

      await cancelScheduledNotificationsForTaskId(task.id);
      await tryScheduleTaskNotification({ ...task, completed: false, completedAt: undefined } as Task, {
        requestPermission: false,
      });

      return;
    }

    await cancelScheduledNotificationsForTaskId(task.id);

    await completeTask(task.id);
    const completedAt = new Date().toISOString();
    const updated = { ...task, completed: true, completedAt };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

    setUndoData({ action: 'complete', task } as unknown as UndoData);
    setTimeout(() => {
      setUndoData((curr) => {
        const isSame = (curr as any)?.action === 'complete' && (curr as any)?.task?.id === task.id;
        if (isSame) {
          if (changeUndoRef.current?.oldTaskId === task.id) changeUndoRef.current = null;
          return null;
        }
        return curr;
      });
    }, 5000);
  };

  const handleDelete = async (task: Task): Promise<void> => {
    const wasImportant = importantSet.has(task.id);
    const importantIndex = wasImportant ? importantOrder.indexOf(task.id) : null;

    await cancelScheduledNotificationsForTaskId(task.id);

    await deleteTask(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));

    if (wasImportant) {
      const nextImp = importantOrder.filter((id) => id !== task.id);
      await persistImportantOrder(nextImp);
    }

    setUndoData({ action: 'delete', task, wasImportant, importantIndex } as unknown as UndoData);
    setTimeout(() => {
      setUndoData((curr) => {
        const isSame = (curr as any)?.action === 'delete' && (curr as any)?.task?.id === task.id;
        if (isSame) return null;
        return curr;
      });
    }, 5000);
  };

  const handleUndo = async (): Promise<void> => {
    const data = undoData as any;
    if (!data) return;

    // Special-case: undo for "Change time" (implemented via action='complete' UI)
    if (
      data.action === 'complete' &&
      changeUndoRef.current &&
      data.task?.id === changeUndoRef.current.oldTaskId
    ) {
      const ctx = changeUndoRef.current;
      changeUndoRef.current = null;

      const current = tasksRef.current;
      const nextTasks = current
        .filter((t) => t.id !== ctx.newTaskId)
        .map((t) =>
          t.id === ctx.oldTaskId
            ? { ...ctx.oldTaskSnapshot, completed: false, completedAt: undefined }
            : t
        );

      setTasks(nextTasks);
      await saveTasks(nextTasks);

      if (ctx.oldWasImportant && ctx.oldImportantIndex !== null && ctx.oldImportantIndex >= 0) {
        const currImp = importantOrderRef.current;
        const nextImp = [...currImp];
        const idx = nextImp.indexOf(ctx.newTaskId);
        if (idx !== -1) nextImp[idx] = ctx.oldTaskId;
        await persistImportantOrder(nextImp);
      }

      await cancelScheduledNotificationsForTaskId(ctx.newTaskId);
      await cancelScheduledNotificationsForTaskId(ctx.oldTaskId);

      const restoredOld = nextTasks.find((t) => t.id === ctx.oldTaskId);
      if (restoredOld) {
        await tryScheduleTaskNotification(restoredOld, { requestPermission: false });
        router.replace({ pathname: '/', params: { highlightTaskId: restoredOld.id } });
      }

      setUndoData(null);
      return;
    }

    if (data.action === 'complete') {
      const t = data.task as Task;
      await uncompleteTask(t.id);
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: false, completedAt: undefined } : x)));

      await cancelScheduledNotificationsForTaskId(t.id);
      await tryScheduleTaskNotification({ ...t, completed: false, completedAt: undefined } as Task, {
        requestPermission: false,
      });
    }

    if (data.action === 'delete') {
      const t = data.task as Task;
      const restored: Task = { ...t, completed: false, completedAt: undefined };
      const nextTasks = [...tasksRef.current, restored];
      setTasks(nextTasks);
      await saveTasks(nextTasks);

      if (data.wasImportant) {
        const idx = (data.importantIndex ?? 0) as number;
        const nextImp = [...importantOrderRef.current];
        const safeIdx = Math.max(0, Math.min(idx, nextImp.length));
        nextImp.splice(safeIdx, 0, t.id);
        await persistImportantOrder(nextImp);
      }

      await cancelScheduledNotificationsForTaskId(t.id);
      await tryScheduleTaskNotification(restored, { requestPermission: false });
    }

    setUndoData(null);
  };

  const showWhenField = titleText.length > 0;

  const handleSubmitTitle = (): void => {
    whenInputRef.current?.focus();
  };

  const handleChangeTitleText = (t: string): void => {
    setTitleText(t);
    if (titleError) setTitleError(null);
  };

  const handleChangeWhenText = (t: string): void => {
    setWhenText(t);
    if (whenError) setWhenError(null);
  };

  const handleSectionLayout = (key: SectionKey, y: number): void => {
    sectionYRef.current[key] = y;
  };

  return (
    <HomeScreenView
      titleText={titleText}
      whenText={whenText}
      titleError={titleError}
      whenError={whenError}
      showWhenField={showWhenField}
      onTitleInputRef={(r) => {
        titleInputRef.current = r;
      }}
      onWhenInputRef={(r) => {
        whenInputRef.current = r;
      }}
      onChangeTitleText={handleChangeTitleText}
      onChangeWhenText={handleChangeWhenText}
      onSubmitTitle={handleSubmitTitle}
      onAdd={handleAdd}
      onScrollRef={(r) => {
        scrollRef.current = r;
      }}
      onSectionLayout={handleSectionLayout}
      now={now}
      lateTasks={lateTasks}
      todayTasks={todayTasks}
      tomorrowTasks={tomorrowTasks}
      thisWeekByDay={thisWeekByDay}
      completedTodayTasks={completedTodayTasks}
      importantSet={importantSet}
      highlightTaskId={highlightTaskId}
      onToggleImportant={toggleImportant}
      onComplete={handleComplete}
      onDelete={handleDelete}
      showImportantModal={showImportantModal}
      importantTasks={importantTasks}
      onOpenImportantModal={() => setShowImportantModal(true)}
      onCloseImportantModal={() => setShowImportantModal(false)}
      onMoveImportant={moveImportant}
      undoData={undoData}
      onUndo={handleUndo}
      navToastMessage={navToast}
    />
  );
}

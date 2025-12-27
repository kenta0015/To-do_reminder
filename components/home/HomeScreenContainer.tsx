// FILE: components/home/HomeScreenContainer.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, ScrollView, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addTask,
  completeTask,
  deleteTask,
  loadTasks,
  saveTasks,
  Task,
  uncompleteTask,
} from '@/lib/storage';
import { useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  addDays,
  endOfWeekSaturday,
  isExpired,
  isKeyInRange,
  parseWhenInput,
  pickStringParam,
  startOfWeekSunday,
  toDateKeyLocal,
} from '@/lib/taskDateUtils';

import HomeScreenView, { SectionKey, TaskRowData } from './HomeScreenView';
import { UndoData } from './UndoToast';

const IMPORTANT_IDS_KEY = '@important_task_ids_v1';

function getRemindAtFromTask(task: Task): Date | null {
  try {
    if (task.when === 'today') {
      const d = new Date();
      d.setSeconds(0, 0);
      return d;
    }

    if (task.when === 'tomorrow') {
      const d = addDays(new Date(), 1);
      d.setSeconds(0, 0);
      return d;
    }

    const parsed = new Date(task.when);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    return null;
  } catch {
    return null;
  }
}

function extractTaskIdFromNotification(req: Notifications.NotificationRequest): string | null {
  const data = (req?.content?.data ?? {}) as any;
  const id = data?.taskId;
  if (typeof id === 'string' && id.length > 0) return id;
  return null;
}

function toLocalDateKeyFromISO(iso: unknown): string | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKeyLocal(d);
}

function toTimeMsFromISO(iso: unknown): number {
  if (typeof iso !== 'string' || iso.length === 0) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

export default function HomeScreenContainer() {
  const params = useLocalSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [importantOrder, setImportantOrder] = useState<string[]>([]);
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
      setNavToast(curr => (curr === message ? null : curr));
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
      const targets = scheduled.filter(req => extractTaskIdFromNotification(req) === taskId);
      await Promise.allSettled(targets.map(req => Notifications.cancelScheduledNotificationAsync(req.identifier)));
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
      const byId = new Map(loadedTasks.map(t => [t.id, t]));
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
      await Promise.allSettled(toCancel.map(id => Notifications.cancelScheduledNotificationAsync(id)));
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
        if (Array.isArray(ids)) setImportantOrder(ids.filter(x => typeof x === 'string'));
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
      const next = importantOrder.filter(x => x !== id);
      await persistImportantOrder(next);
      return;
    }
    const next = [id, ...importantOrder.filter(x => x !== id)];
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

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const todayKey = useMemo(() => toDateKeyLocal(now), [now]);
  const tomorrowKey = useMemo(() => toDateKeyLocal(addDays(now, 1)), [now]);

  const weekStartKey = useMemo(() => toDateKeyLocal(startOfWeekSunday(now)), [now]);
  const weekEndKey = useMemo(() => toDateKeyLocal(endOfWeekSaturday(now)), [now]);

  const normalized = useMemo(() => {
    const result: TaskRowData[] = [];

    tasks.forEach(t => {
      const remindAt = getRemindAtFromTask(t);
      if (!remindAt) return;

      const dateKey = toDateKeyLocal(remindAt);
      result.push({ task: t, remindAt, dateKey });
    });

    return result;
  }, [tasks]);

  const visibleIncomplete = useMemo(() => {
    return normalized.filter(x => !x.task.completed && !isExpired(now, x.remindAt));
  }, [normalized, now]);

  const lateTasks = useMemo(() => {
    return visibleIncomplete
      .filter(x => x.dateKey < todayKey)
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  }, [visibleIncomplete, todayKey]);

  const todayTasks = useMemo(() => {
    return visibleIncomplete
      .filter(x => x.dateKey === todayKey)
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  }, [visibleIncomplete, todayKey]);

  const tomorrowTasks = useMemo(() => {
    return visibleIncomplete
      .filter(x => x.dateKey === tomorrowKey)
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  }, [visibleIncomplete, tomorrowKey]);

  const thisWeekByDay = useMemo(() => {
    const map: Record<string, TaskRowData[]> = {};
    visibleIncomplete.forEach(x => {
      if (x.dateKey === todayKey || x.dateKey === tomorrowKey) return;
      if (!isKeyInRange(x.dateKey, weekStartKey, weekEndKey)) return;
      map[x.dateKey] = map[x.dateKey] ?? [];
      map[x.dateKey].push(x);
    });

    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
    });

    return map;
  }, [visibleIncomplete, todayKey, tomorrowKey, weekStartKey, weekEndKey]);

  const completedTodayTasks = useMemo(() => {
    const today = todayKey;
    return tasks
      .filter(t => t.completed && typeof t.completedAt === 'string')
      .filter(t => toLocalDateKeyFromISO(t.completedAt) === today)
      .sort((a, b) => toTimeMsFromISO(b.completedAt) - toTimeMsFromISO(a.completedAt));
  }, [tasks, todayKey]);

  const importantTasks = useMemo(() => {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const aliveIds = importantOrder.filter(id => byId.has(id));
    const result: Task[] = aliveIds.map(id => byId.get(id)!).filter(t => !t.completed);

    return result;
  }, [tasks, importantOrder]);

  useEffect(() => {
    if (!isReady) return;
    const id = navTaskId;
    if (!id) return;

    if (lastHandledNavIdRef.current === id) return;
    lastHandledNavIdRef.current = id;

    const isInLate = lateTasks.some(x => x.task.id === id);
    const isInToday = todayTasks.some(x => x.task.id === id);
    const isInTomorrow = tomorrowTasks.some(x => x.task.id === id);
    const isInCompletedToday = completedTodayTasks.some(t => t.id === id);

    let isInWeek = false;
    if (!isInLate && !isInToday && !isInTomorrow && !isInCompletedToday) {
      for (const k of Object.keys(thisWeekByDay)) {
        if (thisWeekByDay[k]?.some(x => x.task.id === id)) {
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
      setHighlightTaskId(prev => (prev === id ? null : prev));
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

    const whenParsed = parseWhenInput(whenText);
    if (!whenParsed.ok) {
      setWhenError(whenParsed.error);
      return;
    }

    const remindAt = whenParsed.remindAt;

    const nowMinute = new Date();
    nowMinute.setSeconds(0, 0);
    if (remindAt.getTime() < nowMinute.getTime()) {
      setWhenError('Time must be now or later');
      return;
    }

    const created = await addTask(title, remindAt.toISOString());
    const next = [...tasks, created];
    setTasks(next);

    await tryScheduleTaskNotification(created, { requestPermission: true });

    setTitleText('');
    setWhenText('');
    Keyboard.dismiss();

    setHighlightTaskId(created.id);
    setTimeout(() => {
      setHighlightTaskId(prev => (prev === created.id ? null : prev));
    }, 1600);

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const handleComplete = async (task: Task): Promise<void> => {
    if (task.completed) {
      await uncompleteTask(task.id);
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, completed: false, completedAt: undefined } : t)));

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
    setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));

    setUndoData({ action: 'complete', task });
    setTimeout(() => {
      setUndoData(curr => (curr?.action === 'complete' && curr.task.id === task.id ? null : curr));
    }, 5000);
  };

  const handleDelete = async (task: Task): Promise<void> => {
    const wasImportant = importantSet.has(task.id);
    const importantIndex = wasImportant ? importantOrder.indexOf(task.id) : null;

    await cancelScheduledNotificationsForTaskId(task.id);

    await deleteTask(task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));

    if (wasImportant) {
      const nextImp = importantOrder.filter(id => id !== task.id);
      await persistImportantOrder(nextImp);
    }

    setUndoData({ action: 'delete', task, wasImportant, importantIndex });
    setTimeout(() => {
      setUndoData(curr => (curr?.action === 'delete' && curr.task.id === task.id ? null : curr));
    }, 5000);
  };

  const handleUndo = async (): Promise<void> => {
    const data = undoData;
    if (!data) return;

    if (data.action === 'complete') {
      const t = data.task;
      await uncompleteTask(t.id);
      setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, completed: false, completedAt: undefined } : x)));

      await cancelScheduledNotificationsForTaskId(t.id);
      await tryScheduleTaskNotification({ ...t, completed: false, completedAt: undefined } as Task, {
        requestPermission: false,
      });
    }

    if (data.action === 'delete') {
      const t = data.task;
      const restored: Task = { ...t, completed: false, completedAt: undefined };
      const nextTasks = [...tasks, restored];
      setTasks(nextTasks);
      await saveTasks(nextTasks);

      if (data.wasImportant) {
        const idx = data.importantIndex ?? 0;
        const nextImp = [...importantOrder];
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
      onTitleInputRef={r => {
        titleInputRef.current = r;
      }}
      onWhenInputRef={r => {
        whenInputRef.current = r;
      }}
      onChangeTitleText={handleChangeTitleText}
      onChangeWhenText={handleChangeWhenText}
      onSubmitTitle={handleSubmitTitle}
      onAdd={handleAdd}
      onScrollRef={r => {
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

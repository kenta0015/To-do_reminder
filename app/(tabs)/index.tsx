// FILE: app/(tabs)/index.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadTasks,
  addTask,
  deleteTask,
  completeTask,
  uncompleteTask,
  saveTasks,
  Task,
} from '@/lib/storage';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutLeft } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';

type UndoData =
  | { action: 'complete'; task: Task }
  | { action: 'delete'; task: Task; wasImportant: boolean; importantIndex: number | null };

const IMPORTANT_IDS_KEY = '@important_task_ids_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function endOfWeekSaturday(d: Date): Date {
  const start = startOfWeekSunday(d);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isKeyInRange(key: string, startKey: string, endKey: string): boolean {
  return key >= startKey && key <= endKey;
}

function parseWhenInput(text: string): { ok: true; remindAt: Date } | { ok: false; error: string } {
  const s = text.trim();
  if (!s) return { ok: false, error: 'Required' };

  // MVP format: YYYY/MM/DD HH:mm
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/.exec(s);
  if (!m) return { ok: false, error: 'Format is 2026/06/23 10:00' };

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);

  if (mo < 1 || mo > 12) return { ok: false, error: 'Month must be 01-12' };
  if (da < 1 || da > 31) return { ok: false, error: 'Day must be 01-31' };
  if (hh < 0 || hh > 23) return { ok: false, error: 'Hour must be 00-23' };
  if (mm < 0 || mm > 59) return { ok: false, error: 'Minute must be 00-59' };

  const d = new Date(y, mo - 1, da, hh, mm, 0, 0);

  // Validate the date wasn't auto-rolled (e.g., 2025/02/31 -> Mar 3)
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) {
    return { ok: false, error: 'Invalid date' };
  }

  return { ok: true, remindAt: d };
}

function getDayNameShort(d: Date): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  return names[d.getDay()];
}

function isExpired(now: Date, remindAt: Date): boolean {
  return now.getTime() > remindAt.getTime() + 7 * DAY_MS;
}

function daysLeftUntilExpire(now: Date, remindAt: Date): number {
  const diffMs = now.getTime() - remindAt.getTime();
  const daysLate = Math.floor(diffMs / DAY_MS);
  const left = 7 - daysLate;
  return left < 0 ? 0 : left;
}

function pickStringParam(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() ? v.trim() : null;
  if (Array.isArray(v)) {
    const first = v.find(x => typeof x === 'string') as string | undefined;
    return first && first.trim() ? first.trim() : null;
  }
  return null;
}

export default function HomeScreen() {
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
  const sectionYRef = useRef<{ late?: number; today?: number; tomorrow?: number; week?: number; completed?: number }>({});
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

  useEffect(() => {
    void bootstrap();
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

  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKeyLocal(now), [now]);
  const tomorrowKey = useMemo(() => toDateKeyLocal(addDays(now, 1)), [now]);

  const weekStartKey = useMemo(() => toDateKeyLocal(startOfWeekSunday(now)), [now]);
  const weekEndKey = useMemo(() => toDateKeyLocal(endOfWeekSaturday(now)), [now]);

  const normalized = useMemo(() => {
    const result: { task: Task; remindAt: Date; dateKey: string }[] = [];

    tasks.forEach(t => {
      let remindAt: Date | null = null;

      if (t.when === 'today') {
        const d = new Date();
        d.setSeconds(0, 0);
        remindAt = d;
      } else if (t.when === 'tomorrow') {
        const d = addDays(new Date(), 1);
        d.setSeconds(0, 0);
        remindAt = d;
      } else {
        const parsed = new Date(t.when);
        if (!Number.isNaN(parsed.getTime())) remindAt = parsed;
      }

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
    const map: Record<string, { task: Task; remindAt: Date; dateKey: string }[]> = {};
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
      .filter(t => String(t.completedAt).slice(0, 10) === today)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
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

    try {
      let status = (await Notifications.getPermissionsAsync()).status;
      if (status !== 'granted') {
        status = (await Notifications.requestPermissionsAsync()).status;
      }

      if (status === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Todo Reminder',
            body: title,
            data: { taskId: created.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: remindAt,
          },
        });
      }
    } catch {
      // ignore
    }

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
      return;
    }

    await completeTask(task.id);
    const completedAt = new Date().toISOString();
    const updated = { ...task, completed: true, completedAt };
    setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));

    setUndoData({ action: 'complete', task });
    setTimeout(() => {
      setUndoData(curr => (curr?.action === 'complete' && curr.task.id === task.id ? null : curr));
    }, 2600);
  };

  const handleDelete = async (task: Task): Promise<void> => {
    const wasImportant = importantSet.has(task.id);
    const importantIndex = wasImportant ? importantOrder.indexOf(task.id) : null;

    await deleteTask(task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));

    if (wasImportant) {
      const nextImp = importantOrder.filter(id => id !== task.id);
      await persistImportantOrder(nextImp);
    }

    setUndoData({ action: 'delete', task, wasImportant, importantIndex });
    setTimeout(() => {
      setUndoData(curr => (curr?.action === 'delete' && curr.task.id === task.id ? null : curr));
    }, 2600);
  };

  const handleUndo = async (): Promise<void> => {
    const data = undoData;
    if (!data) return;

    if (data.action === 'complete') {
      const t = data.task;
      await uncompleteTask(t.id);
      setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, completed: false, completedAt: undefined } : x)));
    }

    if (data.action === 'delete') {
      const t = data.task;
      const nextTasks = [...tasks, { ...t, completed: false, completedAt: undefined }];
      setTasks(nextTasks);
      await saveTasks(nextTasks);

      if (data.wasImportant) {
        const idx = data.importantIndex ?? 0;
        const nextImp = [...importantOrder];
        const safeIdx = Math.max(0, Math.min(idx, nextImp.length));
        nextImp.splice(safeIdx, 0, t.id);
        await persistImportantOrder(nextImp);
      }
    }

    setUndoData(null);
  };

  const renderTaskRow = (x: { task: Task; remindAt: Date; dateKey: string }, opts?: { showLateMeta?: boolean }) => {
    const isImportant = importantSet.has(x.task.id);
    const isHighlighted = highlightTaskId === x.task.id;

    const lateMeta =
      opts?.showLateMeta === true
        ? `Created ${String(x.task.createdAt).slice(0, 10)} • ${daysLeftUntilExpire(now, x.remindAt)}d left`
        : null;

    return (
      <Swipeable
        key={x.task.id}
        renderLeftActions={() => (
          <View style={styles.leftActions}>
            <TouchableOpacity
              style={[styles.swipeButton, styles.starButton]}
              onPress={() => toggleImportant(x.task.id)}
              activeOpacity={0.85}
            >
              <Star
                size={22}
                color={isImportant ? '#f59e0b' : '#fff'}
                fill={isImportant ? '#f59e0b' : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        )}
        renderRightActions={() => (
          <View style={styles.rightActions}>
            <TouchableOpacity
              style={[styles.swipeButton, styles.completeButton]}
              onPress={() => handleComplete(x.task)}
              activeOpacity={0.85}
            >
              <Text style={styles.swipeButtonText}>✓</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <Animated.View entering={FadeInDown} style={[styles.taskItem, isHighlighted ? styles.taskItemHighlight : null]}>
          <View style={[styles.taskContent, styles.taskContentRow]}>
            <TouchableOpacity
              style={styles.taskPressArea}
              onPress={() => handleComplete(x.task)}
              onLongPress={() => handleDelete(x.task)}
              activeOpacity={0.85}
            >
              <View style={styles.taskRowTop}>
                <Text style={styles.taskTime}>{formatHm(x.remindAt)}</Text>
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {x.task.title}
                </Text>
              </View>
              {lateMeta ? <Text style={styles.lateMeta}>{lateMeta}</Text> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.inlineStarToggle}
              onPress={() => toggleImportant(x.task.id)}
              activeOpacity={0.85}
            >
              <Star
                size={20}
                color={isImportant ? '#f59e0b' : '#9ca3af'}
                fill={isImportant ? '#f59e0b' : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Swipeable>
    );
  };

  const showWhenField = titleText.length > 0;

  const renderSectionHeader = (label: string, faint?: boolean) => (
    <Text style={faint ? styles.sectionTitleFaint : styles.sectionTitle}>{label}</Text>
  );

  const renderEmpty = () => <Text style={styles.emptyText}>No tasks</Text>;

  const renderImportantModal = () => (
    <Modal visible={showImportantModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Important</Text>
            <TouchableOpacity onPress={() => setShowImportantModal(false)} style={styles.modalClose} activeOpacity={0.85}>
              <X size={20} color="#111" />
            </TouchableOpacity>
          </View>

          {importantTasks.length === 0 ? (
            <Text style={styles.emptyText}>No important tasks</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 18 }} keyboardShouldPersistTaps="handled">
              {importantTasks.map((t, idx) => (
                <Animated.View key={t.id} entering={FadeInDown} exiting={FadeOutLeft} style={styles.importantRow}>
                  <TouchableOpacity
                    style={styles.importantMain}
                    onPress={() => handleComplete(t)}
                    onLongPress={() => handleDelete(t)}
                    activeOpacity={0.85}
                  >
                    <Star size={18} color="#f59e0b" fill="#f59e0b" />
                    <Text style={styles.importantTitle} numberOfLines={2}>
                      {t.title}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.importantControls}>
                    <TouchableOpacity
                      style={[styles.iconBtn, idx === 0 ? styles.iconBtnDisabled : null]}
                      onPress={() => moveImportant(t.id, -1)}
                      disabled={idx === 0}
                      activeOpacity={0.85}
                    >
                      <ChevronUp size={18} color={idx === 0 ? '#bbb' : '#111'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, idx === importantTasks.length - 1 ? styles.iconBtnDisabled : null]}
                      onPress={() => moveImportant(t.id, 1)}
                      disabled={idx === importantTasks.length - 1}
                      activeOpacity={0.85}
                    >
                      <ChevronDown size={18} color={idx === importantTasks.length - 1 ? '#bbb' : '#111'} />
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderUndoToast = () => {
    if (!undoData) return null;
    const label = undoData.action === 'complete' ? 'Completed' : 'Deleted';
    return (
      <View style={styles.toastWrap} pointerEvents="box-none">
        <View style={styles.toast}>
          <Text style={styles.toastText}>{label}</Text>
          <TouchableOpacity onPress={handleUndo} activeOpacity={0.85}>
            <Text style={styles.toastUndo}>Undo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderNavToast = () => {
    if (!navToast) return null;
    return (
      <View style={styles.navToastWrap} pointerEvents="none">
        <View style={styles.navToast}>
          <Text style={styles.navToastText}>{navToast}</Text>
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>

          <View style={styles.inputWrap}>
            <TextInput
              ref={(r) => {
                titleInputRef.current = r;
              }}
              value={titleText}
              onChangeText={t => {
                setTitleText(t);
                if (titleError) setTitleError(null);
              }}
              placeholder="What to do"
              placeholderTextColor="#999"
              style={[styles.input, titleError ? styles.inputError : null]}
              returnKeyType={showWhenField ? 'next' : 'done'}
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (!showWhenField) return;
                whenInputRef.current?.focus();
              }}
            />
            {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}

            {showWhenField ? (
              <>
                <TextInput
                  ref={(r) => {
                    whenInputRef.current = r;
                  }}
                  value={whenText}
                  onChangeText={t => {
                    setWhenText(t);
                    if (whenError) setWhenError(null);
                  }}
                  placeholder="When? (YYYY/MM/DD HH:mm)"
                  placeholderTextColor="#999"
                  style={[styles.input, whenError ? styles.inputError : null]}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleAdd()}
                />
                {whenError ? <Text style={styles.errorText}>{whenError}</Text> : null}
              </>
            ) : null}

            <TouchableOpacity style={styles.addButton} onPress={() => void handleAdd()} activeOpacity={0.85}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.late = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('Late')}
            {lateTasks.length === 0 ? renderEmpty() : lateTasks.map(x => renderTaskRow(x, { showLateMeta: true }))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.today = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('Today')}
            {todayTasks.length === 0 ? renderEmpty() : todayTasks.map(x => renderTaskRow(x))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.tomorrow = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('Tomorrow', true)}
            {tomorrowTasks.length === 0 ? renderEmpty() : tomorrowTasks.map(x => renderTaskRow(x))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.week = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('This Week', true)}
            {Object.keys(thisWeekByDay).length === 0 ? (
              renderEmpty()
            ) : (
              Object.keys(thisWeekByDay)
                .sort()
                .map(k => {
                  const list = thisWeekByDay[k];
                  const d = new Date(`${k}T00:00:00`);
                  const label = `${getDayNameShort(d)} ${k.slice(5).replace('-', '/')}`;
                  return (
                    <View key={k} style={styles.weekDayGroup}>
                      <Text style={styles.weekDayHeader}>{label}</Text>
                      {list.map(x => renderTaskRow(x))}
                    </View>
                  );
                })
            )}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.completed = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.completedHeader}>Completed Today</Text>
            {completedTodayTasks.length === 0 ? (
              <Text style={styles.emptyText}>Nothing yet</Text>
            ) : (
              completedTodayTasks.map(t => (
                <Animated.View key={t.id} entering={FadeInDown} style={styles.completedRow}>
                  <TouchableOpacity
                    style={styles.completedMain}
                    onPress={() => handleComplete(t)}
                    onLongPress={() => handleDelete(t)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.completedCheck}>✓</Text>
                    <Text style={styles.completedTitle} numberOfLines={2}>
                      {t.title}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.importantEntry} onPress={() => setShowImportantModal(true)} activeOpacity={0.85}>
              <Star size={18} color="#f59e0b" fill="#f59e0b" />
              <Text style={styles.importantEntryText}>Important</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: Platform.OS === 'ios' ? 24 : 18 }} />
        </ScrollView>

        {renderImportantModal()}
        {renderUndoToast()}
        {renderNavToast()}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000',
    marginBottom: 10,
  },

  inputWrap: {
    gap: 10,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    fontSize: 16,
    color: '#000',
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#fff5f5',
  },
  errorText: {
    marginTop: -6,
    fontSize: 13,
    color: '#ef4444',
  },
  addButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  content: {
    paddingBottom: 18,
  },

  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  sectionTitleFaint: {
    fontSize: 22,
    fontWeight: '700',
    color: '#777',
    marginBottom: 12,
  },

  completedHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 15,
    color: '#999',
    fontStyle: 'italic',
  },

  taskItem: {
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  taskItemHighlight: {
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  taskContent: {
    padding: 14,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
  },
  taskContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskPressArea: {
    flex: 1,
    paddingRight: 10,
  },
  inlineStarToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
  },

  taskRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskTime: {
    width: 54,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  taskTitle: {
    flex: 1,
    fontSize: 17,
    color: '#000',
    lineHeight: 22,
  },
  lateMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
  },

  leftActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  rightActions: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  swipeButton: {
    width: 72,
    height: 56,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeButtonText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
  },
  starButton: {
    backgroundColor: '#111',
  },
  completeButton: {
    backgroundColor: '#16a34a',
  },

  weekDayGroup: {
    marginBottom: 14,
  },
  weekDayHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
  },

  completedRow: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  completedMain: {
    padding: 12,
    backgroundColor: '#f4f4f5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
  },
  completedCheck: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16a34a',
    width: 18,
  },
  completedTitle: {
    flex: 1,
    fontSize: 16,
    color: '#444',
    textDecorationLine: 'line-through',
  },

  importantEntry: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importantEntryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400e',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  importantRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f1f1',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  importantMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importantTitle: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    lineHeight: 22,
  },
  importantControls: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnDisabled: {
    backgroundColor: '#f3f4f6',
  },

  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 160,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  toastUndo: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '800',
  },

  navToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 66,
    alignItems: 'center',
  },
  navToast: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  navToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

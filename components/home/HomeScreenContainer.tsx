import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutLeft } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  toDateKeyLocal,
  addDays,
  startOfWeekSunday,
  endOfWeekSaturday,
  isKeyInRange,
  parseWhenInput,
  getDayNameShort,
  isExpired,
  pickStringParam,
} from '@/lib/taskDateUtils';
import { styles } from './homeStyles';
import TaskRow from './TaskRow';

type UndoData =
  | { action: 'complete'; task: Task }
  | { action: 'delete'; task: Task; wasImportant: boolean; importantIndex: number | null };

type TaskRowData = { task: Task; remindAt: Date; dateKey: string };

const IMPORTANT_IDS_KEY = '@important_task_ids_v1';

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
  const sectionYRef = useRef<{ late?: number; today?: number; tomorrow?: number; week?: number; completed?: number }>(
    {}
  );
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
    const result: TaskRowData[] = [];

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
                    onPress={() => void handleComplete(t)}
                    onLongPress={() => void handleDelete(t)}
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
                      onPress={() => void moveImportant(t.id, -1)}
                      disabled={idx === 0}
                      activeOpacity={0.85}
                    >
                      <ChevronUp size={18} color={idx === 0 ? '#bbb' : '#111'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, idx === importantTasks.length - 1 ? styles.iconBtnDisabled : null]}
                      onPress={() => void moveImportant(t.id, 1)}
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
          <TouchableOpacity onPress={() => void handleUndo()} activeOpacity={0.85}>
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
            {lateTasks.length === 0
              ? renderEmpty()
              : lateTasks.map(x => (
                  <TaskRow
                    key={x.task.id}
                    item={x}
                    now={now}
                    isImportant={importantSet.has(x.task.id)}
                    isHighlighted={highlightTaskId === x.task.id}
                    showLateMeta
                    onToggleImportant={toggleImportant}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                  />
                ))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.today = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('Today')}
            {todayTasks.length === 0
              ? renderEmpty()
              : todayTasks.map(x => (
                  <TaskRow
                    key={x.task.id}
                    item={x}
                    now={now}
                    isImportant={importantSet.has(x.task.id)}
                    isHighlighted={highlightTaskId === x.task.id}
                    onToggleImportant={toggleImportant}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                  />
                ))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.tomorrow = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('Tomorrow', true)}
            {tomorrowTasks.length === 0
              ? renderEmpty()
              : tomorrowTasks.map(x => (
                  <TaskRow
                    key={x.task.id}
                    item={x}
                    now={now}
                    isImportant={importantSet.has(x.task.id)}
                    isHighlighted={highlightTaskId === x.task.id}
                    onToggleImportant={toggleImportant}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                  />
                ))}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              sectionYRef.current.week = e.nativeEvent.layout.y;
            }}
          >
            {renderSectionHeader('This Week', true)}
            {Object.keys(thisWeekByDay).length === 0
              ? renderEmpty()
              : Object.keys(thisWeekByDay)
                  .sort()
                  .map(k => {
                    const list = thisWeekByDay[k];
                    const d = new Date(`${k}T00:00:00`);
                    const label = `${getDayNameShort(d)} ${k.slice(5).replace('-', '/')}`;
                    return (
                      <View key={k} style={styles.weekDayGroup}>
                        <Text style={styles.weekDayHeader}>{label}</Text>
                        {list.map(x => (
                          <TaskRow
                            key={x.task.id}
                            item={x}
                            now={now}
                            isImportant={importantSet.has(x.task.id)}
                            isHighlighted={highlightTaskId === x.task.id}
                            onToggleImportant={toggleImportant}
                            onComplete={handleComplete}
                            onDelete={handleDelete}
                          />
                        ))}
                      </View>
                    );
                  })}
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
                    onPress={() => void handleComplete(t)}
                    onLongPress={() => void handleDelete(t)}
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

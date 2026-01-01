// FILE: components/home/HomeScreenView.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp, Star } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Task } from '@/lib/storage';
import { getDayNameShort } from '@/lib/taskDateUtils';

import { styles } from './homeStyles';
import TaskRow from './TaskRow';
import UndoToast, { UndoData } from './UndoToast';
import NavToast from './NavToast';
import ImportantHelpModal from './ImportantHelpModal';

export type TaskRowData = { task: Task; remindAt: Date; dateKey: string };

export type SectionKey = 'late' | 'today' | 'tomorrow' | 'week' | 'completed';

type CollapsibleSectionKey = 'late' | 'today' | 'tomorrow' | 'week';

type Props = {
  // Inputs
  titleText: string;
  whenText: string;
  titleError: string | null;
  whenError: string | null;
  showWhenField: boolean;

  onTitleInputRef: (r: TextInput | null) => void;
  onWhenInputRef: (r: TextInput | null) => void;

  onChangeTitleText: (t: string) => void;
  onChangeWhenText: (t: string) => void;

  onSubmitTitle: () => void;
  onAdd: () => void | Promise<void>;

  // Scroll + section measurement (for nav highlight)
  onScrollRef: (r: ScrollView | null) => void;
  onSectionLayout: (key: SectionKey, y: number) => void;

  // Data for lists
  now: Date;
  lateTasks: TaskRowData[];
  todayTasks: TaskRowData[];
  tomorrowTasks: TaskRowData[];
  thisWeekByDay: Record<string, TaskRowData[]>;
  completedTodayTasks: Task[];

  // Row state
  importantSet: Set<string>;
  highlightTaskId: string | null;

  // Row handlers
  onToggleImportant: (id: string) => void | Promise<void>;
  onComplete: (task: Task) => void | Promise<void>;
  onDelete: (task: Task) => void | Promise<void>;

  // Important modal
  showImportantModal: boolean;
  importantTasks: Task[];
  onOpenImportantModal: () => void;
  onCloseImportantModal: () => void;
  onMoveImportant: (id: string, dir: -1 | 1) => void | Promise<void>;

  // Toasts
  undoData: UndoData | null;
  onUndo: () => void | Promise<void>;

  navToastMessage: string | null;

  // Collapsible sections (optional until wired from container)
  collapsed?: Partial<Record<CollapsibleSectionKey, boolean>>;
  onToggleSection?: (key: CollapsibleSectionKey) => void;
};

export default function HomeScreenView({
  titleText,
  whenText,
  titleError,
  whenError,
  showWhenField,
  onTitleInputRef,
  onWhenInputRef,
  onChangeTitleText,
  onChangeWhenText,
  onSubmitTitle,
  onAdd,
  onScrollRef,
  onSectionLayout,
  now,
  lateTasks,
  todayTasks,
  tomorrowTasks,
  thisWeekByDay,
  completedTodayTasks,
  importantSet,
  highlightTaskId,
  onToggleImportant,
  onComplete,
  onDelete,
  showImportantModal,
  importantTasks,
  onOpenImportantModal,
  onCloseImportantModal,
  onMoveImportant,
  undoData,
  onUndo,
  navToastMessage,
  collapsed,
  onToggleSection,
}: Props) {
  const isCollapsed = (key: CollapsibleSectionKey): boolean => !!collapsed?.[key];

  const getWeekCount = (): number => {
    let total = 0;
    for (const list of Object.values(thisWeekByDay)) total += list.length;
    return total;
  };

  const renderCollapsibleHeader = (
    key: CollapsibleSectionKey,
    label: string,
    count: number,
    faint?: boolean
  ) => {
    const closed = isCollapsed(key);
    const Icon = closed ? ChevronDown : ChevronUp;

    return (
      <TouchableOpacity
        onPress={onToggleSection ? () => onToggleSection(key) : undefined}
        disabled={!onToggleSection}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={faint ? styles.sectionTitleFaint : styles.sectionTitle}>{label}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={[
              styles.sectionTitleFaint,
              {
                marginRight: 8,
                opacity: faint ? 0.8 : 0.7,
              },
            ]}
          >
            ({count})
          </Text>
          <Icon size={18} color={faint ? '#999' : '#666'} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => <Text style={styles.emptyText}>No tasks</Text>;

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>

          <View style={styles.inputWrap}>
            <TextInput
              ref={onTitleInputRef}
              value={titleText}
              onChangeText={onChangeTitleText}
              placeholder="What to do"
              placeholderTextColor="#999"
              style={[styles.input, titleError ? styles.inputError : null]}
              returnKeyType={showWhenField ? 'next' : 'done'}
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (!showWhenField) return;
                onSubmitTitle();
              }}
            />
            {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}

            {showWhenField ? (
              <>
                <TextInput
                  ref={onWhenInputRef}
                  value={whenText}
                  onChangeText={onChangeWhenText}
                  placeholder="When? (YYYY/MM/DD HH:mm)"
                  placeholderTextColor="#999"
                  style={[styles.input, whenError ? styles.inputError : null]}
                  returnKeyType="done"
                  onSubmitEditing={() => void onAdd()}
                />
                {whenError ? <Text style={styles.errorText}>{whenError}</Text> : null}
              </>
            ) : null}

            <TouchableOpacity
              style={styles.addButton}
              onPress={() => void onAdd()}
              activeOpacity={0.85}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={onScrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View
            style={styles.section}
            onLayout={e => {
              onSectionLayout('late', e.nativeEvent.layout.y);
            }}
          >
            {renderCollapsibleHeader('late', 'Late', lateTasks.length)}
            {isCollapsed('late') ? null : lateTasks.length === 0 ? (
              renderEmpty()
            ) : (
              lateTasks.map(x => (
                <TaskRow
                  key={x.task.id}
                  item={x}
                  now={now}
                  isImportant={importantSet.has(x.task.id)}
                  isHighlighted={highlightTaskId === x.task.id}
                  showLateMeta
                  onToggleImportant={onToggleImportant}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              ))
            )}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              onSectionLayout('today', e.nativeEvent.layout.y);
            }}
          >
            {renderCollapsibleHeader('today', 'Today', todayTasks.length)}
            {isCollapsed('today') ? null : todayTasks.length === 0 ? (
              renderEmpty()
            ) : (
              todayTasks.map(x => (
                <TaskRow
                  key={x.task.id}
                  item={x}
                  now={now}
                  isImportant={importantSet.has(x.task.id)}
                  isHighlighted={highlightTaskId === x.task.id}
                  onToggleImportant={onToggleImportant}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              ))
            )}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              onSectionLayout('tomorrow', e.nativeEvent.layout.y);
            }}
          >
            {renderCollapsibleHeader('tomorrow', 'Tomorrow', tomorrowTasks.length, true)}
            {isCollapsed('tomorrow') ? null : tomorrowTasks.length === 0 ? (
              renderEmpty()
            ) : (
              tomorrowTasks.map(x => (
                <TaskRow
                  key={x.task.id}
                  item={x}
                  now={now}
                  isImportant={importantSet.has(x.task.id)}
                  isHighlighted={highlightTaskId === x.task.id}
                  onToggleImportant={onToggleImportant}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              ))
            )}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              onSectionLayout('week', e.nativeEvent.layout.y);
            }}
          >
            {renderCollapsibleHeader('week', 'This Week', getWeekCount(), true)}
            {isCollapsed('week') ? null : Object.keys(thisWeekByDay).length === 0 ? (
              renderEmpty()
            ) : (
              Object.keys(thisWeekByDay)
                .sort()
                .map(k => {
                  const list = thisWeekByDay[k] ?? [];
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
                          onToggleImportant={onToggleImportant}
                          onComplete={onComplete}
                          onDelete={onDelete}
                        />
                      ))}
                    </View>
                  );
                })
            )}
          </View>

          <View
            style={styles.section}
            onLayout={e => {
              onSectionLayout('completed', e.nativeEvent.layout.y);
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
                    onPress={() => void onComplete(t)}
                    onLongPress={() => void onDelete(t)}
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
            <TouchableOpacity
              style={styles.importantEntry}
              onPress={onOpenImportantModal}
              activeOpacity={0.85}
            >
              <Star size={18} color="#f59e0b" fill="#f59e0b" />
              <Text style={styles.importantEntryText}>Important</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: Platform.OS === 'ios' ? 24 : 18 }} />
        </ScrollView>

        <ImportantHelpModal
          visible={showImportantModal}
          tasks={importantTasks}
          onClose={onCloseImportantModal}
          onComplete={onComplete}
          onDelete={onDelete}
          onMove={onMoveImportant}
        />

        <UndoToast undoData={undoData} onUndo={onUndo} />
        <NavToast message={navToastMessage} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

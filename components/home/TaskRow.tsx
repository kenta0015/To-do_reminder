import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Star } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Task } from '@/lib/storage';
import { formatHm, daysLeftUntilExpire } from '@/lib/taskDateUtils';

type TaskRowData = { task: Task; remindAt: Date; dateKey: string };

type Props = {
  item: TaskRowData;
  now: Date;
  isImportant: boolean;
  isHighlighted: boolean;
  showLateMeta?: boolean;
  onToggleImportant: (taskId: string) => void | Promise<void>;
  onComplete: (task: Task) => void | Promise<void>;
  onDelete: (task: Task) => void | Promise<void>;
};

export default function TaskRow({
  item,
  now,
  isImportant,
  isHighlighted,
  showLateMeta,
  onToggleImportant,
  onComplete,
  onDelete,
}: Props) {
  const lateMeta =
    showLateMeta === true
      ? `Created ${String(item.task.createdAt).slice(0, 10)} • ${daysLeftUntilExpire(now, item.remindAt)}d left`
      : null;

  return (
    <Swipeable
      renderLeftActions={() => (
        <View style={styles.leftActions}>
          <TouchableOpacity
            style={[styles.swipeButton, styles.starButton]}
            onPress={() => void onToggleImportant(item.task.id)}
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
            onPress={() => void onComplete(item.task)}
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
            onPress={() => void onComplete(item.task)}
            onLongPress={() => void onDelete(item.task)}
            activeOpacity={0.85}
          >
            <View style={styles.taskRowTop}>
              <Text style={styles.taskTime}>{formatHm(item.remindAt)}</Text>
              <Text style={styles.taskTitle} numberOfLines={2}>
                {item.task.title}
              </Text>
            </View>
            {lateMeta ? <Text style={styles.lateMeta}>{lateMeta}</Text> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.inlineStarToggle}
            onPress={() => void onToggleImportant(item.task.id)}
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
}

const styles = StyleSheet.create({
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
});

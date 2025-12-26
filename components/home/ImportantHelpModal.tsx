// FILE: components/home/ImportantHelpModal.tsx

import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Star, X } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutLeft } from 'react-native-reanimated';
import { Task } from '@/lib/storage';
import { styles } from './homeStyles';

type Props = {
  visible: boolean;
  tasks: Task[];
  onClose: () => void;
  onComplete: (task: Task) => void | Promise<void>;
  onDelete: (task: Task) => void | Promise<void>;
  onMove: (taskId: string, dir: -1 | 1) => void | Promise<void>;
};

export default function ImportantHelpModal({
  visible,
  tasks,
  onClose,
  onComplete,
  onDelete,
  onMove,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Important</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose} activeOpacity={0.85}>
              <X size={20} color="#111" />
            </TouchableOpacity>
          </View>

          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>No important tasks</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 18 }} keyboardShouldPersistTaps="handled">
              {tasks.map((t, idx) => (
                <Animated.View key={t.id} entering={FadeInDown} exiting={FadeOutLeft} style={styles.importantRow}>
                  <TouchableOpacity
                    style={styles.importantMain}
                    onPress={() => void onComplete(t)}
                    onLongPress={() => void onDelete(t)}
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
                      onPress={() => void onMove(t.id, -1)}
                      disabled={idx === 0}
                      activeOpacity={0.85}
                    >
                      <ChevronUp size={18} color={idx === 0 ? '#bbb' : '#111'} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.iconBtn, idx === tasks.length - 1 ? styles.iconBtnDisabled : null]}
                      onPress={() => void onMove(t.id, 1)}
                      disabled={idx === tasks.length - 1}
                      activeOpacity={0.85}
                    >
                      <ChevronDown size={18} color={idx === tasks.length - 1 ? '#bbb' : '#111'} />
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
}

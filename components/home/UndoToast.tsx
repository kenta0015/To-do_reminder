// FILE: components/home/UndoToast.tsx

import { View, Text, TouchableOpacity } from 'react-native';
import { Task } from '@/lib/storage';
import { styles } from './homeStyles';

export type UndoData =
  | { action: 'complete'; task: Task }
  | { action: 'delete'; task: Task; wasImportant: boolean; importantIndex: number | null };

type Props = {
  undoData: UndoData | null;
  onUndo: () => void | Promise<void>;
};

export default function UndoToast({ undoData, onUndo }: Props) {
  if (!undoData) return null;

  const label = undoData.action === 'complete' ? 'Completed' : 'Deleted';

  return (
    <View style={styles.toastWrap} pointerEvents="box-none">
      <View style={styles.toast}>
        <Text style={styles.toastText}>{label}</Text>
        <TouchableOpacity onPress={() => void onUndo()} activeOpacity={0.85}>
          <Text style={styles.toastUndo}>Undo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

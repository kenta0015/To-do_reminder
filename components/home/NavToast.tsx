// FILE: components/home/NavToast.tsx

import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './homeStyles';

type Props = {
  message: string | null;
};

export default function NavToast({ message }: Props) {
  if (!message) return null;

  return (
    <View style={styles.navToastWrap} pointerEvents="none">
      <View style={styles.navToast}>
        <Text style={styles.navToastText}>{message}</Text>
      </View>
    </View>
  );
}

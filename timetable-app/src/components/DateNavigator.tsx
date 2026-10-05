import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** 있으면 라벨 옆에 ⌄ 를 붙이고 눌러서 캘린더를 연다 */
  onPressLabel?: () => void;
}

export function DateNavigator({ label, onPrev, onNext, onPressLabel }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전" onPress={onPrev} hitSlop={12}>
        <Icon name="chevron-left-20" />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onPressLabel} disabled={!onPressLabel} style={styles.label}>
        <Text variant="bodyMdMedium" color={colors.textTertiary}>
          {label}
        </Text>
        {onPressLabel && <Icon name="chevron-down-20" />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="다음" onPress={onNext} hitSlop={12}>
        <Icon name="chevron-right-20" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: colors.bgSecondary,
  },
  label: { flexDirection: 'row', alignItems: 'center' },
});

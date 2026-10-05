import { Pressable, StyleSheet, View } from 'react-native';

import { formatRange } from '../planner';
import { colors, radius } from '../theme';
import type { Schedule } from '../types';
import { Icon } from './Icon';
import { Text } from './Text';

interface Props {
  schedule: Schedule;
  done: boolean;
  last: boolean;
  onToggle: () => void;
  onPress: () => void;
}

/** Figma "Schedule List": 체크 동그라미 · 제목/시간 · 오른쪽 화살표 */
export function ScheduleItem({ schedule, done, last, onToggle, onPress }: Props) {
  return (
    <View style={[styles.row, !last && styles.underbar]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${schedule.title} 공부 완료`}
        onPress={onToggle}
        hitSlop={10}
        style={[styles.check, { backgroundColor: done ? colors.bgBrandSubtle : colors.bgTertiary }]}
      >
        <Icon name={done ? 'check-brand' : 'check'} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${schedule.title} 수정`} onPress={onPress} style={styles.body}>
        <View style={styles.texts}>
          <Text variant="bodyLgSemibold" color={done ? colors.textQuinary : colors.textSecondary} numberOfLines={1}>
            {schedule.title}
          </Text>
          <Text variant="bodyMdRegular" color={done ? colors.textQuinary : colors.textQuaternary}>
            {formatRange(schedule)}
          </Text>
        </View>
        <View style={styles.chevron}>
          <Icon name="chevron-right" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  underbar: { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary },
  check: { width: 28, height: 28, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  texts: { flex: 1, gap: 2 },
  chevron: { height: 46, justifyContent: 'center', paddingHorizontal: 8 },
});

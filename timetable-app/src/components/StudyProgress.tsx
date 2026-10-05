import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { formatDuration, type StudySummary } from '../planner';
import { colors, radius } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** "4시간 40분 중 1시간 50분 공부 완료" + 그라데이션 진행 막대 */
export function StudyProgress({ summary }: { summary: StudySummary }) {
  const ratio = summary.total ? summary.done / summary.total : 0;
  return (
    <View style={styles.wrap}>
      {summary.allDone ? (
        <View style={styles.doneRow}>
          <Icon name="check-circle" />
          <Text variant="headingSm" color={colors.textSecondary}>
            {formatDuration(summary.total)} 공부 완료
          </Text>
        </View>
      ) : (
        <Text variant="headingSm" color={colors.textSecondary}>
          {formatDuration(summary.total)} 중 <Text variant="headingSm" color={colors.textBrandBold}>{formatDuration(summary.done)}</Text> 공부 완료
        </Text>
      )}
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
        {ratio > 0 && (
          <LinearGradient
            colors={[colors.bgBrandSubtle, colors.bgBrand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${ratio * 100}%` }]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: radius.round, backgroundColor: colors.bgTertiary, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.round },
});

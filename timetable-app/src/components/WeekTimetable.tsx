import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DAY_LABELS } from '../date';
import { DAY_END, DAY_START, formatShortHM, HOURS } from '../planner';
import { colors, radius } from '../theme';
import type { Schedule } from '../types';
import { Text } from './Text';

const COL_WIDTH = 64;
const COL_GAP = 4;
const HOUR_HEIGHT = 60;
const toY = (minutes: number) => ((minutes - DAY_START) / 60) * HOUR_HEIGHT;

interface Props {
  /** 월~일 각 요일에 보여줄 일정 */
  days: Schedule[][];
  onPressSchedule: (dayIndex: number, schedule: Schedule) => void;
}

/** 주간 일정 그리드. 월~금이 한 화면에 보이고 옆으로 밀면 토·일이 나온다. */
export function WeekTimetable({ days, onPressSchedule }: Props) {
  const height = toY(DAY_END);
  return (
    <View style={styles.wrap}>
      <View style={styles.hours}>
        {HOURS.map((h) => (
          <View key={h} style={styles.hourRow}>
            <Text variant="bodySmMedium" color={colors.textQuinary}>
              {String(h).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View>
          <View style={styles.header}>
            {DAY_LABELS.map((label) => (
              <View key={label} style={styles.dayHead}>
                <Text variant="bodyMdMedium" color={colors.textQuinary}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.grid, { height }]}>
            {DAY_LABELS.map((label, d) => (
              <View key={label} style={[styles.column, { height }]}>
                {d > 0 && <View style={[styles.separator, { height }]} />}
                {days[d].map((s) => (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}요일 ${s.title} ${formatShortHM(s.start)}부터 ${formatShortHM(s.end)}까지`}
                    onPress={() => onPressSchedule(d, s)}
                    style={[styles.block, { top: toY(s.start), height: toY(s.end) - toY(s.start), backgroundColor: s.color }]}
                  >
                    <Text variant="bodySmMedium" color={colors.textSecondary} numberOfLines={2}>
                      {s.title}
                    </Text>
                    <Text variant="bodySmRegular" color={colors.textQuaternary} numberOfLines={1}>
                      {formatShortHM(s.start)}
                    </Text>
                    <Text variant="bodySmRegular" color={colors.textQuaternary} numberOfLines={1}>
                      {formatShortHM(s.end)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', paddingLeft: 20 },
  hours: { width: 20, paddingTop: 44 },
  hourRow: { height: HOUR_HEIGHT },
  scroll: { paddingRight: 20 },
  header: { flexDirection: 'row', gap: COL_GAP, paddingVertical: 4, marginBottom: 8 },
  dayHead: { width: COL_WIDTH, alignItems: 'center', paddingVertical: 4 },
  grid: { flexDirection: 'row', gap: COL_GAP },
  column: { width: COL_WIDTH },
  separator: {
    position: 'absolute',
    left: -COL_GAP / 2 - 0.5,
    top: 0,
    width: 1,
    backgroundColor: colors.borderSecondary,
  },
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: radius.md,
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 2,
    overflow: 'hidden',
  },
});

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateNavigator } from '../components/DateNavigator';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { WeekTimetable } from '../components/WeekTimetable';
import { addDays, formatWeekRange, weekDates } from '../date';
import { schedulesOn, timetableLabel } from '../planner';
import { colors, radius } from '../theme';
import type { DateKey, PlannerState, Schedule } from '../types';

interface Props {
  state: PlannerState;
  date: DateKey;
  onChangeDate: (date: DateKey) => void;
  onOpenCalendar: () => void;
  onOpenTimetables: () => void;
  onPlan: () => void;
  onEdit: (schedule: Schedule, date: DateKey) => void;
}

/** 시간표 › 주간 일정 */
export function WeekView({ state, date, onChangeDate, onOpenCalendar, onOpenTimetables, onPlan, onEdit }: Props) {
  const dates = weekDates(date);
  const active = state.timetables.find((t) => t.id === state.activeTimetableId);
  return (
    <View style={styles.root}>
      <DateNavigator
        label={formatWeekRange(date)}
        onPrev={() => onChangeDate(addDays(date, -7))}
        onNext={() => onChangeDate(addDays(date, 7))}
        onPressLabel={onOpenCalendar}
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="시간표 목록" onPress={onOpenTimetables} style={styles.timetable}>
            <Text variant="bodyLgSemibold" color={colors.textSecondary} numberOfLines={1}>
              {active ? timetableLabel(active) : '시간표'}
            </Text>
            <Icon name="chevron-down" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onPlan} style={({ pressed }) => [styles.plan, pressed && { opacity: 0.85 }]}>
            <Text variant="bodyMdMedium">계획 세우기</Text>
          </Pressable>
        </View>
        <WeekTimetable days={dates.map((d) => schedulesOn(state, d))} onPressSchedule={(i, s) => onEdit(s, dates[i])} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  timetable: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, flexShrink: 1 },
  plan: {
    width: 100,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.bgTertiary,
  },
});

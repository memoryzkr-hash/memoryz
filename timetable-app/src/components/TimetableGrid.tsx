import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DAY_LABELS, dayFromDate, hourRange, minutesOfDay, visibleDays } from '../timetable';
import type { Course, Day } from '../types';
import { theme } from '../theme';

const HOUR_HEIGHT = 64;
const TIME_COL_WIDTH = 28;

interface Props {
  courses: Course[];
  now: Date;
  onPressCourse: (course: Course) => void;
  onPressEmpty: (day: Day, hour: number) => void;
}

export function TimetableGrid({ courses, now, onPressCourse, onPressEmpty }: Props) {
  const days = visibleDays(courses);
  const { first, last } = hourRange(courses);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const today = dayFromDate(now);
  const nowMin = minutesOfDay(now);
  const showNowLine = days.includes(today) && nowMin >= first * 60 && nowMin <= last * 60;
  const toY = (minutes: number) => ((minutes - first * 60) / 60) * HOUR_HEIGHT;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ width: TIME_COL_WIDTH }} />
        {days.map((d) => (
          <View key={d} style={styles.headerCell}>
            <Text style={[styles.headerText, d === today && styles.headerToday]}>{DAY_LABELS[d]}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <View style={{ width: TIME_COL_WIDTH }}>
            {hours.map((h) => (
              <View key={h} style={styles.hourLabelCell}>
                <Text style={styles.hourLabel}>{h > 12 ? h - 12 : h}</Text>
              </View>
            ))}
          </View>

          {days.map((d) => (
            <View key={d} style={styles.dayCol}>
              {hours.map((h) => (
                <Pressable
                  key={h}
                  accessibilityLabel={`${DAY_LABELS[d]}요일 ${h}시에 수업 추가`}
                  onPress={() => onPressEmpty(d, h)}
                  style={styles.slot}
                />
              ))}

              {courses
                .filter((c) => c.day === d)
                .map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => onPressCourse(c)}
                    style={[
                      styles.block,
                      { top: toY(c.start), height: toY(c.end) - toY(c.start), backgroundColor: c.color },
                    ]}
                  >
                    <Text style={styles.blockTitle} numberOfLines={2}>
                      {c.name}
                    </Text>
                    {!!c.room && (
                      <Text style={styles.blockSub} numberOfLines={1}>
                        {c.room}
                      </Text>
                    )}
                  </Pressable>
                ))}

              {showNowLine && d === today && <View pointerEvents="none" style={[styles.nowLine, { top: toY(nowMin) }]} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  headerText: { fontSize: 13, color: theme.textSub, fontWeight: '600' },
  headerToday: { color: theme.primary },
  body: { flexDirection: 'row' },
  hourLabelCell: { height: HOUR_HEIGHT, alignItems: 'flex-end', paddingRight: 4, paddingTop: 2 },
  hourLabel: { fontSize: 11, color: theme.textSub },
  dayCol: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.border,
  },
  slot: {
    height: HOUR_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  block: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 6,
    padding: 4,
    overflow: 'hidden',
  },
  blockTitle: { fontSize: 11, fontWeight: '700', color: '#1F1F1F' },
  blockSub: { fontSize: 10, color: '#3C3C3C', marginTop: 2 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: theme.primary },
});

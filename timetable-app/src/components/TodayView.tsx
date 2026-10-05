import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DAY_LABELS, coursesOn, dayFromDate, formatRange, todayStatus } from '../timetable';
import type { Course } from '../types';
import { theme } from '../theme';

interface Props {
  courses: Course[];
  now: Date;
  onPressCourse: (course: Course) => void;
}

export function TodayView({ courses, now, onPressCourse }: Props) {
  const day = dayFromDate(now);
  const list = coursesOn(courses, day);
  const { current, next } = todayStatus(courses, now);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.date}>
        {now.getMonth() + 1}월 {now.getDate()}일 {DAY_LABELS[day]}요일
      </Text>

      <View style={styles.statusCard}>
        {current ? (
          <>
            <Text style={styles.statusLabel}>지금 수업 중</Text>
            <Text style={styles.statusTitle}>{current.name}</Text>
            <Text style={styles.statusSub}>
              {formatRange(current)}
              {current.room ? ` · ${current.room}` : ''}
            </Text>
          </>
        ) : next ? (
          <>
            <Text style={styles.statusLabel}>다음 수업</Text>
            <Text style={styles.statusTitle}>{next.name}</Text>
            <Text style={styles.statusSub}>
              {formatRange(next)}
              {next.room ? ` · ${next.room}` : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.statusTitle}>{list.length ? '오늘 수업이 모두 끝났어요 🎉' : '오늘은 수업이 없어요'}</Text>
        )}
      </View>

      {list.map((c) => (
        <Pressable key={c.id} onPress={() => onPressCourse(c)} style={styles.row}>
          <View style={[styles.colorBar, { backgroundColor: c.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{c.name}</Text>
            <Text style={styles.rowSub}>
              {formatRange(c)}
              {c.room ? ` · ${c.room}` : ''}
              {c.professor ? ` · ${c.professor}` : ''}
            </Text>
          </View>
          {current?.id === c.id && <Text style={styles.badge}>진행 중</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 96, gap: 10 },
  date: { fontSize: 15, color: theme.textSub, fontWeight: '600', marginBottom: 4 },
  statusCard: {
    backgroundColor: theme.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 6,
  },
  statusLabel: { color: '#FFFFFFCC', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  statusTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  statusSub: { color: '#FFFFFFDD', fontSize: 14, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  colorBar: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
  rowSub: { fontSize: 13, color: theme.textSub, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: '700', color: theme.primary },
});

import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CourseEditor } from './src/components/CourseEditor';
import { TimetableGrid } from './src/components/TimetableGrid';
import { TodayView } from './src/components/TodayView';
import { loadCourses, saveCourses } from './src/storage';
import { theme } from './src/theme';
import { dayFromDate, newId, pickColor } from './src/timetable';
import type { Course, CourseDraft, Day } from './src/types';

type Tab = 'week' | 'today';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function confirmDelete(name: string, onConfirm: () => void) {
  const message = `'${name}' 수업을 삭제할까요?`;
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message)) onConfirm();
    return;
  }
  Alert.alert('수업 삭제', message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const loaded = useRef(false);
  const [tab, setTab] = useState<Tab>('week');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [slot, setSlot] = useState<{ day: Day; hour: number } | null>(null);
  const now = useNow();

  useEffect(() => {
    loadCourses().then((saved) => {
      setCourses(saved);
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (loaded.current) saveCourses(courses);
  }, [courses]);

  const initial = useMemo<CourseDraft>(() => {
    const day = slot?.day ?? Math.min(dayFromDate(new Date()), 4);
    const hour = slot?.hour ?? 9;
    return {
      name: '',
      room: '',
      professor: '',
      day: day as Day,
      start: hour * 60,
      end: hour * 60 + 75,
      color: pickColor(courses),
    };
  }, [slot, courses]);

  const openNew = (s: { day: Day; hour: number } | null = null) => {
    setEditing(null);
    setSlot(s);
    setEditorOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setEditorOpen(true);
  };

  const save = (draft: CourseDraft) => {
    setCourses((list) =>
      editing ? list.map((c) => (c.id === editing.id ? { ...draft, id: c.id } : c)) : [...list, { ...draft, id: newId() }],
    );
    setEditorOpen(false);
  };

  const remove = (id: string) => {
    const target = courses.find((c) => c.id === id);
    if (!target) return;
    confirmDelete(target.name, () => {
      setCourses((list) => list.filter((c) => c.id !== id));
      setEditorOpen(false);
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.title}>시간표</Text>
          <View style={styles.tabs}>
            {(['week', 'today'] as const).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'week' ? '주간' : '오늘'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.content}>
          {tab === 'week' ? (
            <TimetableGrid
              courses={courses}
              now={now}
              onPressCourse={openEdit}
              onPressEmpty={(day, hour) => openNew({ day, hour })}
            />
          ) : (
            <TodayView courses={courses} now={now} onPressCourse={openEdit} />
          )}
        </View>

        <Pressable style={styles.fab} onPress={() => openNew()} accessibilityLabel="수업 추가">
          <Text style={styles.fabText}>+</Text>
        </Pressable>

        <CourseEditor
          visible={editorOpen}
          course={editing}
          initial={initial}
          courses={courses}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditorOpen(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: theme.text },
  tabs: { flexDirection: 'row', backgroundColor: '#E8EAED', borderRadius: 10, padding: 3 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  tabOn: { backgroundColor: theme.surface },
  tabText: { fontSize: 14, color: theme.textSub, fontWeight: '600' },
  tabTextOn: { color: theme.text },
  content: { flex: 1, paddingHorizontal: 12, paddingBottom: 12 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#FFFFFF', fontSize: 30, lineHeight: 32, fontWeight: '400' },
});

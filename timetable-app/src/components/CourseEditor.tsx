import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COURSE_COLORS, DAY_LABELS, MAX_TIME, MIN_TIME, TIME_STEP, formatTime, validateCourse } from '../timetable';
import type { Course, CourseDraft, Day } from '../types';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  /** 수정할 수업. 없으면 새 수업을 initial 값으로 만든다. */
  course: Course | null;
  initial: CourseDraft;
  courses: Course[];
  onSave: (draft: CourseDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function CourseEditor({ visible, course, initial, courses, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<CourseDraft>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(course ? { ...course } : initial);
    setError(null);
  }, [visible, course, initial]);

  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  const save = () => {
    const message = validateCourse(draft, courses, course?.id);
    if (message) {
      setError(message);
      return;
    }
    onSave({ ...draft, name: draft.name.trim(), room: draft.room.trim(), professor: draft.professor.trim() });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.topAction}>취소</Text>
          </Pressable>
          <Text style={styles.topTitle}>{course ? '수업 수정' : '새 수업'}</Text>
          <Pressable onPress={save} hitSlop={12}>
            <Text style={[styles.topAction, styles.topSave]}>저장</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Field label="과목명">
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(v) => set('name', v)}
              placeholder="예: 자료구조"
              placeholderTextColor={theme.textSub}
              autoFocus={!course}
            />
          </Field>
          <Field label="강의실">
            <TextInput
              style={styles.input}
              value={draft.room}
              onChangeText={(v) => set('room', v)}
              placeholder="예: 공학관 301"
              placeholderTextColor={theme.textSub}
            />
          </Field>
          <Field label="교수명">
            <TextInput
              style={styles.input}
              value={draft.professor}
              onChangeText={(v) => set('professor', v)}
              placeholder="예: 김교수"
              placeholderTextColor={theme.textSub}
            />
          </Field>

          <Field label="요일">
            <View style={styles.chips}>
              {DAY_LABELS.map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => set('day', i as Day)}
                  style={[styles.chip, draft.day === i && styles.chipOn]}
                >
                  <Text style={[styles.chipText, draft.day === i && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <View style={styles.timeRow}>
            <Field label="시작" style={{ flex: 1 }}>
              <TimeStepper value={draft.start} onChange={(v) => set('start', v)} />
            </Field>
            <Field label="종료" style={{ flex: 1 }}>
              <TimeStepper value={draft.end} onChange={(v) => set('end', v)} />
            </Field>
          </View>

          <Field label="색상">
            <View style={styles.chips}>
              {COURSE_COLORS.map((color) => (
                <Pressable
                  key={color}
                  accessibilityLabel={`색상 ${color}`}
                  onPress={() => set('color', color)}
                  style={[styles.swatch, { backgroundColor: color }, draft.color === color && styles.swatchOn]}
                />
              ))}
            </View>
          </Field>

          {error && <Text style={styles.error}>{error}</Text>}

          {course && (
            <Pressable onPress={() => onDelete(course.id)} style={styles.deleteButton}>
              <Text style={styles.deleteText}>수업 삭제</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const BIG_STEP = 30;

function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const shift = (delta: number) => onChange(Math.min(MAX_TIME, Math.max(MIN_TIME, value + delta)));
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => shift(-TIME_STEP)}
        onLongPress={() => shift(-BIG_STEP)}
        style={styles.stepButton}
        accessibilityLabel="5분 빠르게 (길게 누르면 30분)"
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{formatTime(value)}</Text>
      <Pressable
        onPress={() => shift(TIME_STEP)}
        onLongPress={() => shift(BIG_STEP)}
        style={styles.stepButton}
        accessibilityLabel="5분 늦게 (길게 누르면 30분)"
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  topTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  topAction: { fontSize: 16, color: theme.textSub },
  topSave: { color: theme.primary, fontWeight: '700' },
  form: { padding: 16, gap: 16, paddingBottom: 48 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: theme.textSub },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  chipOn: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 15, color: theme.text },
  chipTextOn: { color: '#FFFFFF', fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  stepButton: { paddingHorizontal: 14, paddingVertical: 10 },
  stepText: { fontSize: 20, color: theme.primary, fontWeight: '600' },
  stepValue: { fontSize: 16, fontWeight: '600', color: theme.text, fontVariant: ['tabular-nums'] },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: theme.text },
  error: { color: theme.danger, fontSize: 14 },
  deleteButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: theme.surface,
  },
  deleteText: { color: theme.danger, fontSize: 16, fontWeight: '600' },
});

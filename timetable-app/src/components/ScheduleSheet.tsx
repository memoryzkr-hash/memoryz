import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatDots } from '../date';
import { formatClock } from '../planner';
import { colors } from '../theme';
import type { DateKey, ScheduleKind } from '../types';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { Text } from './Text';
import { TextField } from './TextField';

export interface ScheduleDraft {
  kind: ScheduleKind;
  title: string;
  date: DateKey;
  start: number;
  end: number;
}

interface Props {
  visible: boolean;
  mode: 'add' | 'edit';
  /** 시트를 열 때의 값. 시트 안에서 고친 값은 onSubmit/onChangeTime으로 돌려준다. */
  draft: ScheduleDraft;
  onSubmit: (draft: ScheduleDraft) => void;
  onClose: () => void;
  /** 수정 모드에서만 */
  onDelete?: () => void;
  onChangeTime?: (draft: ScheduleDraft) => void;
}

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'fixed', label: '이번 학기 고정 일정' },
  { kind: 'once', label: '일회성 일정' },
];

/** 일정 추가(제목 작성) / 일정 수정 바텀시트 */
export function ScheduleSheet({ visible, mode, draft: initial, onSubmit, onClose, onDelete, onChangeTime }: Props) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  const canSubmit = draft.title.trim().length > 0;
  const submit = () => canSubmit && onSubmit(draft);
  const changeTime = () => onChangeTime?.(draft);

  return (
    <BottomSheet
      visible={visible}
      title={mode === 'add' ? '일정 추가' : '일정 수정'}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          {mode === 'edit' && <Button label="일정 삭제" kind="secondary" onPress={onDelete} style={styles.flex} />}
          <Button label={mode === 'add' ? '일정 추가하기' : '수정 완료'} disabled={!canSubmit} onPress={submit} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} tone={draft.kind === k.kind ? 'selected' : 'plain'} onPress={() => setDraft({ ...draft, kind: k.kind })} />
        ))}
      </View>
      <View style={styles.fields}>
        <TextField
          label="제목"
          value={draft.title}
          onChangeText={(title) => setDraft({ ...draft, title })}
          placeholder="일정을 입력해주세요"
          searchIcon={mode === 'add'}
          onSubmitEditing={submit}
        />
      </View>
      {mode === 'edit' && (
        <View style={styles.times}>
          <TimeRow label="시작 시각" date={draft.date} minutes={draft.start} onPress={changeTime} underbar />
          <TimeRow label="종료 시각" date={draft.date} minutes={draft.end} onPress={changeTime} />
        </View>
      )}
    </BottomSheet>
  );
}

function TimeRow({ label, date, minutes, onPress, underbar }: { label: string; date: DateKey; minutes: number; onPress: () => void; underbar?: boolean }) {
  return (
    <View style={[styles.timeRow, underbar && styles.underbar]}>
      <Text variant="bodyLgMedium" color={colors.textSecondary}>
        {label}
      </Text>
      <View style={styles.timeValue}>
        <Text variant="bodyMdRegular" color={colors.textQuinary}>
          {formatDots(date)}
        </Text>
        <Chip label={formatClock(minutes)} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  fields: { padding: 20 },
  times: { paddingHorizontal: 20, paddingBottom: 20 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  underbar: { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary },
  timeValue: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  flex: { flex: 1 },
});

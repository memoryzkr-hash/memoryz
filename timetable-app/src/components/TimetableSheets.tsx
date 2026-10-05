import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import type { Timetable } from '../types';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextField } from './TextField';

interface ListProps {
  visible: boolean;
  timetables: Timetable[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (t: Timetable) => void;
  onAdd: () => void;
  onClose: () => void;
}

/** 시간표 목록: 현재 적용된 시간표는 연도를 주황색으로 표시 */
export function TimetableListSheet({ visible, timetables, activeId, onSelect, onDelete, onAdd, onClose }: ListProps) {
  return (
    <BottomSheet visible={visible} title="시간표 목록" onClose={onClose} action={{ icon: 'plus', label: '시간표 추가', onPress: onAdd }}>
      <View style={styles.list}>
        {timetables.map((t) => {
          const active = t.id === activeId;
          return (
            <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onSelect(t.id)} style={styles.row}>
              <Chip label={String(t.year)} tone={active ? 'brand' : 'selected'} />
              <Text variant="bodyLgSemibold" color={colors.textTertiary} style={styles.name} numberOfLines={1}>
                {t.name}
              </Text>
              {active ? (
                <Icon name="chevron-right" />
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`${t.year} ${t.name} 삭제`} onPress={() => onDelete(t)} hitSlop={10}>
                  <Icon name="x" />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

export function TimetableAddSheet({ visible, onSubmit, onClose }: { visible: boolean; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (visible) setName('');
  }, [visible]);
  const submit = () => name.trim() && onSubmit(name.trim());
  return (
    <BottomSheet
      visible={visible}
      title="시간표 추가"
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label="시간표 추가하기" disabled={!name.trim()} onPress={submit} />
        </View>
      }
    >
      <View style={styles.fields}>
        <TextField label="시간표 이름" value={name} onChangeText={setName} placeholder="예: 2학기 시간표" onSubmitEditing={submit} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  name: { flex: 1 },
  fields: { padding: 20 },
  footer: { paddingHorizontal: 20, paddingVertical: 16 },
});

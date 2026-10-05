import { Pressable, StyleSheet, View } from 'react-native';

import { DAY_LABELS } from '../date';
import { HOURS, SLOT_COUNT, type SlotRange } from '../planner';
import { colors } from '../theme';
import type { Day } from '../types';
import { Text } from './Text';

const CELL_HEIGHT = 30;

interface Props {
  /** 요일별 이미 일정이 있는 칸. null이면 그 요일 칸은 그리지 않는다(헤더만). */
  occupied: (boolean[] | null)[];
  selection: (SlotRange | null)[];
  onToggle: (day: Day, slot: number) => void;
}

/** 일정 추가·시간 변경·계획 세우기에서 쓰는 30분 칸 선택 그리드 (월~일) */
export function SlotGrid({ occupied, selection, onToggle }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {DAY_LABELS.map((label) => (
          <View key={label} style={styles.dayHead}>
            <Text variant="bodyMdMedium" color={colors.textQuinary}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.body}>
        <View style={styles.hours}>
          {HOURS.map((h) => (
            <View key={h} style={styles.hourRow}>
              <Text variant="bodySmMedium" color={colors.textQuinary}>
                {String(h).padStart(2, '0')}
              </Text>
            </View>
          ))}
        </View>
        {DAY_LABELS.map((label, d) => {
          const taken = occupied[d];
          const sel = selection[d];
          return (
            <View key={label} style={styles.column}>
              {taken &&
                Array.from({ length: SLOT_COUNT }, (_, i) => {
                  const selected = !!sel && i >= sel.start && i < sel.end;
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} ${9 + Math.floor(i / 2)}시 ${i % 2 ? '30분' : '정각'}`}
                      accessibilityState={{ disabled: taken[i], selected }}
                      disabled={taken[i]}
                      onPress={() => onToggle(d as Day, i)}
                      style={[
                        styles.cell,
                        taken[i] && { backgroundColor: colors.bgDisabled },
                        selected && { backgroundColor: colors.bgBrandSubtle },
                      ]}
                    />
                  );
                })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  header: { flexDirection: 'row', gap: 4, height: 36, paddingLeft: 20, paddingVertical: 4, alignItems: 'center' },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  body: { flexDirection: 'row', gap: 4 },
  hours: { width: 20, marginRight: -4 },
  hourRow: { height: CELL_HEIGHT * 2 },
  column: { flex: 1 },
  cell: { height: CELL_HEIGHT, borderWidth: 1, borderColor: colors.borderSecondary, backgroundColor: colors.bgPrimary },
});

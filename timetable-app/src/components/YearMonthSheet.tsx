import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';

interface Props {
  visible: boolean;
  year: number;
  month: number;
  onSave: (year: number, month: number) => void;
  onClose: () => void;
}

/** "날짜 설정": 년·월 휠. 위아래 값을 누르면 한 칸씩 이동한다. */
export function YearMonthSheet({ visible, year, month, onSave, onClose }: Props) {
  const [y, setY] = useState(year);
  const [m, setM] = useState(month);

  useEffect(() => {
    if (visible) {
      setY(year);
      setM(month);
    }
  }, [visible, year, month]);

  const months = (offset: number) => {
    const v = m + offset;
    return v >= 1 && v <= 12 ? String(v).padStart(2, '0') : '';
  };

  return (
    <BottomSheet
      visible={visible}
      title="날짜 설정"
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label="저장하기" onPress={() => onSave(y, m)} />
        </View>
      }
    >
      <View style={styles.body}>
        <Neighbors year={[String(y - 2), String(y - 1)]} month={[months(-2), months(-1)]} onYear={(d) => setY(y + d)} onMonth={(d) => setM(m + d)} side="above" />
        <View style={styles.selected}>
          <View style={styles.unit}>
            <Text variant="headingMd">{y}</Text>
            <Text variant="bodyLgRegular" color={colors.textTertiary}>
              년
            </Text>
          </View>
          <View style={styles.unit}>
            <Text variant="headingMd">{String(m).padStart(2, '0')}</Text>
            <Text variant="bodyLgRegular" color={colors.textTertiary}>
              월
            </Text>
          </View>
        </View>
        <Neighbors year={[String(y + 1), String(y + 2)]} month={[months(1), months(2)]} onYear={(d) => setY(y + d)} onMonth={(d) => setM(m + d)} side="below" />
      </View>
    </BottomSheet>
  );
}

function Neighbors({
  year,
  month,
  onYear,
  onMonth,
  side,
}: {
  year: [string, string];
  month: [string, string];
  onYear: (delta: number) => void;
  onMonth: (delta: number) => void;
  side: 'above' | 'below';
}) {
  // 위쪽은 [-2, -1], 아래쪽은 [+1, +2]
  const deltas = side === 'above' ? [-2, -1] : [1, 2];
  const near = side === 'above' ? 1 : 0;
  const column = (values: [string, string], onPick: (d: number) => void, label: string) => (
    <View style={styles.column}>
      {values.map((v, i) => (
        <Pressable key={i} disabled={!v} onPress={() => onPick(deltas[i])} accessibilityRole="button" accessibilityLabel={v ? `${v}${label}` : undefined}>
          <Text variant={i === near ? 'bodyLgMedium' : 'bodyLgRegular'} color={i === near ? colors.textTertiary : colors.textQuinary} style={styles.value}>
            {v || ' '}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={styles.neighbors}>
      {column(year, onYear, '년')}
      {column(month, onMonth, '월')}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 12 },
  neighbors: { flexDirection: 'row', justifyContent: 'center', gap: 48 },
  column: { gap: 4, width: 70, alignItems: 'flex-end' },
  value: { textAlign: 'right' },
  selected: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 48,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  unit: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 70, justifyContent: 'flex-end' },
  footer: { paddingHorizontal: 20, paddingVertical: 16 },
});

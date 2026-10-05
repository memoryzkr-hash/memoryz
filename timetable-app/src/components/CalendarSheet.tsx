import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fromKey, monthMatrix } from '../date';
import { formatStudyTime } from '../planner';
import { colors, radius } from '../theme';
import type { DateKey } from '../types';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { YearMonthSheet } from './YearMonthSheet';

const WEEK_HEAD = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  visible: boolean;
  date: DateKey;
  today: DateKey;
  /** 날짜 아래에 보여줄 순 공부시간(분) */
  studiedMinutes: (date: DateKey) => number;
  onPick: (date: DateKey) => void;
  onClose: () => void;
}

export function CalendarSheet({ visible, date, today, studiedMinutes, onPick, onClose }: Props) {
  const [selected, setSelected] = useState(date);
  const [month, setMonth] = useState(() => ({ y: fromKey(date).getFullYear(), m: fromKey(date).getMonth() + 1 }));
  const [pickingMonth, setPickingMonth] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(date);
    setMonth({ y: fromKey(date).getFullYear(), m: fromKey(date).getMonth() + 1 });
  }, [visible, date]);

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m - 1 + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <>
      <BottomSheet
        visible={visible && !pickingMonth}
        title="캘린더"
        onClose={onClose}
        footer={
          <View style={styles.footer}>
            <Button label="선택한 날짜의 플래너 확인" onPress={() => onPick(selected)} />
          </View>
        }
      >
        <View style={styles.body}>
          <View style={styles.monthRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => shift(-1)} hitSlop={12} style={styles.arrow}>
              <Icon name="chevron-left-20" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="년월 설정" onPress={() => setPickingMonth(true)} style={styles.monthLabel}>
              <Text variant="bodyLgMedium" color={colors.textQuaternary}>
                {month.y}년 {month.m}월
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => shift(1)} hitSlop={12} style={styles.arrow}>
              <Icon name="chevron-right-20" />
            </Pressable>
          </View>
          <View style={styles.weekHead}>
            {WEEK_HEAD.map((d) => (
              <View key={d} style={styles.cellHead}>
                <Text variant="bodyMdMedium" color={colors.textQuinary}>
                  {d}
                </Text>
              </View>
            ))}
          </View>
          {monthMatrix(month.y, month.m).map((week, i) => (
            <View key={i} style={styles.week}>
              {week.map((key, j) =>
                key ? (
                  <DayCell
                    key={key}
                    date={key}
                    selected={key === selected}
                    today={key === today}
                    minutes={studiedMinutes(key)}
                    onPress={() => setSelected(key)}
                  />
                ) : (
                  <View key={`empty-${j}`} style={styles.cell} />
                ),
              )}
            </View>
          ))}
        </View>
      </BottomSheet>
      <YearMonthSheet
        visible={visible && pickingMonth}
        year={month.y}
        month={month.m}
        onSave={(y, m) => {
          setMonth({ y, m });
          setPickingMonth(false);
        }}
        onClose={() => setPickingMonth(false)}
      />
    </>
  );
}

function DayCell({ date, selected, today, minutes, onPress }: { date: DateKey; selected: boolean; today: boolean; minutes: number; onPress: () => void }) {
  const day = fromKey(date).getDate();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={date} onPress={onPress} style={styles.cell}>
      {selected ? (
        <View style={styles.selectedCircle}>
          <Text variant="bodyMdSemibold" color={colors.textInverse}>
            {day}
          </Text>
        </View>
      ) : (
        <>
          <Text variant="bodyMdMedium" color={today ? colors.textBrand : colors.textTertiary}>
            {day}
          </Text>
          <Text variant="bodySmRegular" color={colors.textQuinary}>
            {formatStudyTime(minutes)}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  arrow: { paddingVertical: 2 },
  monthLabel: { width: 160, alignItems: 'center' },
  weekHead: { flexDirection: 'row', paddingVertical: 2 },
  cellHead: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 12, minHeight: 64 },
  selectedCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.bgBrand,
    opacity: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 20, paddingVertical: 16 },
});

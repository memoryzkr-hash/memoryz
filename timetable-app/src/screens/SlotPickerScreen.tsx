import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '../components/AppBar';
import { BottomBar, Button } from '../components/Button';
import { DateNavigator } from '../components/DateNavigator';
import { Icon } from '../components/Icon';
import { SlotGrid } from '../components/SlotGrid';
import { Text } from '../components/Text';
import { describeSelection, type SlotRange } from '../planner';
import { colors } from '../theme';
import type { Day } from '../types';

interface Props {
  title: string;
  dateLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onPressDate?: () => void;
  occupied: (boolean[] | null)[];
  selection: (SlotRange | null)[];
  onToggle: (day: Day, slot: number) => void;
  onBack: () => void;
  /** 선택이 없을 때 왼쪽 버튼(취소하기), 있을 때는 전체 선택 해제 */
  onCancel: () => void;
  onClear: () => void;
  confirmLabel: string;
  onConfirm: () => void;
}

/** 일정 추가 / 시간 변경 / 시간표 계획 세우기 화면의 공통 틀 */
export function SlotPickerScreen(p: Props) {
  const picked = p.selection.flatMap((r, d) => (r ? [describeSelection(d as Day, r)] : []));
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <AppBar title={p.title} onBack={p.onBack} />
      <DateNavigator label={p.dateLabel} onPrev={p.onPrev} onNext={p.onNext} onPressLabel={p.onPressDate} />
      <ScrollView style={styles.root}>
        <View style={styles.hint}>
          {picked.length ? (
            <Text variant="bodyMdRegular" color={colors.textQuinary}>
              {picked.join(' / ')}
            </Text>
          ) : (
            <>
              <Icon name="alert-circle-20" />
              <Text variant="bodyMdRegular" color={colors.textQuinary}>
                시간대를 선택하여 일정을 추가하세요
              </Text>
            </>
          )}
        </View>
        <SlotGrid occupied={p.occupied} selection={p.selection} onToggle={p.onToggle} />
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <BottomBar>
          {picked.length ? (
            <Button label="전체 선택 해제" kind="secondary" onPress={p.onClear} style={styles.flex} />
          ) : (
            <Button label="취소하기" kind="secondary" onPress={p.onCancel} style={styles.flex} />
          )}
          <Button label={p.confirmLabel} disabled={!picked.length} onPress={p.onConfirm} style={styles.flex} />
        </BottomBar>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 20 },
  bottom: { backgroundColor: colors.bgPrimary },
  flex: { flex: 1 },
});

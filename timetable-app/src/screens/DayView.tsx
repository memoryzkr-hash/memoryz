import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { DateNavigator } from '../components/DateNavigator';
import { ScheduleItem } from '../components/ScheduleItem';
import { StudyProgress } from '../components/StudyProgress';
import { Text } from '../components/Text';
import { addDays, formatDayTitle } from '../date';
import { isDone, schedulesOn, studySummary } from '../planner';
import { colors } from '../theme';
import type { DateKey, PlannerState, Schedule } from '../types';

interface Props {
  state: PlannerState;
  date: DateKey;
  onChangeDate: (date: DateKey) => void;
  onOpenCalendar: () => void;
  onToggleDone: (id: string) => void;
  onEdit: (schedule: Schedule) => void;
  onAdd: () => void;
}

/** 시간표 › 하루: 그날의 플래너 */
export function DayView({ state, date, onChangeDate, onOpenCalendar, onToggleDone, onEdit, onAdd }: Props) {
  const list = schedulesOn(state, date);
  return (
    <View style={styles.root}>
      <DateNavigator
        label={formatDayTitle(date)}
        onPrev={() => onChangeDate(addDays(date, -1))}
        onNext={() => onChangeDate(addDays(date, 1))}
        onPressLabel={onOpenCalendar}
      />
      {list.length ? (
        <ScrollView style={styles.root}>
          <StudyProgress summary={studySummary(state, date)} />
          <View style={styles.list}>
            {list.map((s, i) => (
              <ScheduleItem
                key={s.id}
                schedule={s}
                done={isDone(state, date, s.id)}
                last={i === list.length - 1}
                onToggle={() => onToggleDone(s.id)}
                onPress={() => onEdit(s)}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/memoryz-logo.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          </View>
          <View style={styles.emptyTexts}>
            <Text variant="headingMd" color={colors.textQuaternary} style={styles.center}>
              비어있는 하루예요
            </Text>
            <Text variant="bodyMdRegular" color={colors.textQuaternary} style={styles.center}>
              일정을 추가해 체계적으로 학습을 관리하세요
            </Text>
          </View>
        </View>
      )}
      <View style={styles.addBar}>
        {list.length ? (
          <Button label="일정 추가" kind="secondary" height={48} icon="plus" labelColor={colors.textSecondary} onPress={onAdd} />
        ) : (
          <Button label="일정 추가" height={48} icon="plus-white" onPress={onAdd} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  logoBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: 43, height: 40, resizeMode: 'contain' },
  emptyTexts: { gap: 4, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  addBar: { paddingHorizontal: 20, paddingVertical: 12 },
});

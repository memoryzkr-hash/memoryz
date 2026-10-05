import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const ITEMS: { label: string; icon: IconName; selected?: boolean }[] = [
  { label: '홈', icon: 'nav-home' },
  { label: '학습', icon: 'nav-learning' },
  { label: '시간표', icon: 'nav-schedule-selected', selected: true },
  { label: '복습', icon: 'nav-review' },
  { label: '마이', icon: 'nav-my' },
];

/** MemoryZ 하단 탭. 이 앱에서는 시간표 탭만 구현되어 있다. */
export function BottomNav() {
  return (
    <View style={styles.bar}>
      {ITEMS.map((item) => (
        <View key={item.label} style={styles.item} accessibilityState={{ selected: item.selected }}>
          <Icon name={item.icon} />
          <Text variant="bodySmMedium" color={item.selected ? colors.textPrimary : colors.textQuinary}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  item: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
});

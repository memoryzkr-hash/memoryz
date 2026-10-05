import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Text } from './Text';

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={[styles.tab, on ? styles.tabOn : styles.tabOff]}
          >
            <Text variant={on ? 'bodyMdSemibold' : 'bodyMdMedium'} color={on ? colors.textPrimary : colors.textTertiary}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, height: 36 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.borderInverseBolder },
  tabOff: { borderBottomWidth: 1, borderBottomColor: colors.borderSecondary },
});

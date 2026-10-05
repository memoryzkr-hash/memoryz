import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export function AppBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} disabled={!onBack} hitSlop={8}>
        <Icon name="chevron-left-32" />
      </Pressable>
      <Text variant="headingMd" style={styles.title}>
        {title}
      </Text>
      <View style={styles.trailing} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.bgPrimary,
  },
  title: { flex: 1 },
  trailing: { width: 32, height: 32 },
});

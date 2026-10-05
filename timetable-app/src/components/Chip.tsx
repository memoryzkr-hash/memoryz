import { Pressable, StyleSheet } from 'react-native';

import { colors, radius } from '../theme';
import { Text } from './Text';

type Tone = 'selected' | 'plain' | 'brand';

const BG: Record<Tone, string> = { selected: colors.bgTertiary, plain: 'transparent', brand: colors.bgBrandSubtle };
const FG: Record<Tone, string> = { selected: colors.textSecondary, plain: colors.textQuaternary, brand: colors.textBrandBold };

/** Figma "Selection Chip_Squre" */
export function Chip({ label, tone = 'selected', onPress }: { label: string; tone?: Tone; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: tone !== 'plain' } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: BG[tone] }]}
    >
      <Text variant="bodyMdMedium" color={FG[tone]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});

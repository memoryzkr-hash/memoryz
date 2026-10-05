import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'danger';

const BG: Record<Kind, string> = { primary: colors.bgBrand, secondary: colors.bgTertiary, danger: colors.bgDanger };
const FG: Record<Kind, string> = { primary: colors.textInverse, secondary: colors.textPrimary, danger: colors.textInverse };

interface Props {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  disabled?: boolean;
  /** 48 (목록 아래 버튼, 모달) 또는 52 (하단 고정 버튼) */
  height?: 48 | 52;
  icon?: IconName;
  /** 회색 "일정 추가" 버튼처럼 글자색만 다른 경우 */
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, kind = 'primary', disabled, height = 52, icon, labelColor, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height, backgroundColor: disabled ? colors.bgDisabled : BG[kind], opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={24} />}
      <Text variant="bodyLgSemibold" color={disabled ? colors.textQuinary : (labelColor ?? FG[kind])}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 화면 하단 고정 버튼 영역 (그림자 + 흰 배경 + 좌우 20 / 위아래 16) */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
  },
  bar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.bgPrimary,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});

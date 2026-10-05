import { Platform, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { colors, type as typeScale } from '../theme';

type Variant = keyof typeof typeScale;

// 한글이 글자 단위가 아니라 어절 단위로 줄바꿈되도록 (웹)
const keepAll = Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as TextStyle) : null;

export function Text({ variant = 'bodyMdRegular', color = colors.textPrimary, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  return <RNText lineBreakStrategyIOS="hangul-word" {...rest} style={[typeScale[variant], { color }, keepAll, style]} />;
}

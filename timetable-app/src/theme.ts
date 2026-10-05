import type { TextStyle } from 'react-native';

// Figma "MemoryZ UI Design" 변수(color/*, spacing/*, border/radius/*)를 옮긴 토큰.
export const colors = {
  textPrimary: '#171717',
  textSecondary: '#404040',
  textTertiary: '#525252',
  textQuaternary: '#737373',
  textQuinary: '#a1a1a1',
  textBrand: '#ff6f10',
  textBrandBold: '#d95e0e',
  textInverse: '#ffffff',

  bgPrimary: '#ffffff',
  bgSecondary: '#fafafa',
  bgTertiary: '#f5f5f5',
  bgDisabled: '#d4d4d4',
  bgBrand: '#ff6f10',
  bgBrandSubtle: '#fff4eb',
  bgSuccessSubtle: '#f0fdf4',
  bgWarningSubtle: '#fefce8',
  bgInfoSubtle: '#eff6ff',
  bgDanger: '#e7000b',
  dim: 'rgba(0,0,0,0.32)',

  borderSecondary: '#e5e5e5',
  borderInverseBolder: '#171717',
} as const;

export const radius = { md: 4, lg: 8, sheet: 32, round: 9999 } as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
} as const;

const font = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0): TextStyle => ({
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
});

export const type = {
  headingMd: font(fonts.semibold, 20, 28, -0.2),
  headingSm: font(fonts.semibold, 16, 24, -0.2),
  bodyLgSemibold: font(fonts.semibold, 16, 24),
  bodyLgMedium: font(fonts.medium, 16, 24),
  bodyLgRegular: font(fonts.regular, 16, 24),
  bodyMdSemibold: font(fonts.semibold, 14, 20),
  bodyMdMedium: font(fonts.medium, 14, 20),
  bodyMdRegular: font(fonts.regular, 14, 20),
  bodySmMedium: font(fonts.medium, 12, 16),
  bodySmRegular: font(fonts.regular, 12, 16),
} as const;

/** 고정 일정 배경은 이 중에서 랜덤으로, 일회성 일정은 회색. */
export const FIXED_SCHEDULE_COLORS = [
  colors.bgBrandSubtle,
  colors.bgSuccessSubtle,
  colors.bgWarningSubtle,
  colors.bgInfoSubtle,
] as const;
export const ONCE_SCHEDULE_COLOR = colors.bgTertiary;

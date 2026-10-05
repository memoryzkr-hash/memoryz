import type { SvgProps } from 'react-native-svg';

import AlertCircle20 from '../../assets/icons/alert-circle-20.svg';
import CancelCircle from '../../assets/icons/cancel-circle.svg';
import Check from '../../assets/icons/check.svg';
import CheckBrand from '../../assets/icons/check-brand.svg';
import CheckCircle from '../../assets/icons/check-circle.svg';
import ChevronDown from '../../assets/icons/chevron-down.svg';
import ChevronDown20 from '../../assets/icons/chevron-down-20.svg';
import ChevronLeft20 from '../../assets/icons/chevron-left-20.svg';
import ChevronLeft32 from '../../assets/icons/chevron-left-32.svg';
import ChevronRight from '../../assets/icons/chevron-right.svg';
import ChevronRight20 from '../../assets/icons/chevron-right-20.svg';
import DragHandle from '../../assets/icons/drag-handle.svg';
import NavHome from '../../assets/icons/nav-home.svg';
import NavLearning from '../../assets/icons/nav-learning.svg';
import NavMy from '../../assets/icons/nav-my.svg';
import NavReview from '../../assets/icons/nav-review.svg';
import NavScheduleSelected from '../../assets/icons/nav-schedule-selected.svg';
import Plus32 from '../../assets/icons/plus-32.svg';
import Plus32White from '../../assets/icons/plus-32-white.svg';
import Search from '../../assets/icons/search.svg';
import X from '../../assets/icons/x.svg';
import X32 from '../../assets/icons/x-32.svg';

// Figma에서 내보낸 SVG 그대로. 색은 SVG 안에 들어 있다.
const ICONS = {
  'alert-circle-20': AlertCircle20,
  'cancel-circle': CancelCircle,
  check: Check,
  'check-brand': CheckBrand,
  'check-circle': CheckCircle,
  'chevron-down': ChevronDown,
  'chevron-down-20': ChevronDown20,
  'chevron-left-20': ChevronLeft20,
  'chevron-left-32': ChevronLeft32,
  'chevron-right': ChevronRight,
  'chevron-right-20': ChevronRight20,
  'drag-handle': DragHandle,
  'nav-home': NavHome,
  'nav-learning': NavLearning,
  'nav-my': NavMy,
  'nav-review': NavReview,
  'nav-schedule-selected': NavScheduleSelected,
  plus: Plus32,
  'plus-white': Plus32White,
  search: Search,
  x: X,
  'x-32': X32,
} as const;

export type IconName = keyof typeof ICONS;

const DEFAULT_SIZE: Partial<Record<IconName, number>> = {
  'alert-circle-20': 20,
  'chevron-down-20': 20,
  'chevron-left-20': 20,
  'chevron-right-20': 20,
  'chevron-left-32': 32,
  'x-32': 32,
};

export function Icon({ name, size, ...rest }: { name: IconName; size?: number } & SvgProps) {
  const Svg = ICONS[name];
  const s = size ?? DEFAULT_SIZE[name] ?? 24;
  return <Svg width={s} height={s} {...rest} />;
}

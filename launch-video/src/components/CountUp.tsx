import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CLAMP } from '../anim';
import { springs } from '../theme';

/** Line box of every rolling glyph, in em. Leaves room so digits never touch the clip edge. */
export const LINE = 1.15;
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const cell: React.CSSProperties = { display: 'block', height: `${LINE}em`, lineHeight: LINE };

/** One odometer column. `position` 0–10 scrolls the 0…9,0 strip; fractions sit between digits. */
export const DigitColumn: React.FC<{ position: number; blur?: number }> = ({ position, blur = 0 }) => {
  const p = ((position % 10) + 10) % 10;
  return (
    <span
      style={{
        ...cell,
        overflow: 'hidden',
        fontVariantNumeric: 'tabular-nums',
        // Soften the clip edge so half-rolled digits fade instead of being sliced.
        maskImage: 'linear-gradient(to bottom, transparent 0%, #000 13%, #000 87%, transparent 100%)',
      }}
    >
      <span
        style={{
          display: 'block',
          transform: `translateY(${-p * LINE}em)`,
          filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
        }}
      >
        {STRIP.map((d, i) => (
          <span key={i} style={cell}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
};

/** Static glyph that lines up with DigitColumn cells. */
export const Glyph: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ ...cell, ...style }}>{children}</span>
);

/** Row that keeps rolling columns and static glyphs on one baseline. */
export const RollRow: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', whiteSpace: 'pre', ...style }}>{children}</div>
);

/** Odometer position of decimal place `place` (0 = ones) for a continuous value. */
const odometer = (value: number, place: number) => {
  const unit = 10 ** place;
  if (place === 0) return value % 10;
  const whole = Math.floor(value / unit);
  const carry = Math.max(0, value - whole * unit - (unit - 1));
  return (whole % 10) + carry;
};

const placesOf = (n: number) => Math.max(1, Math.floor(Math.abs(n)).toString().length);

/**
 * Counts `from` → `to` like an odometer: the ones column rolls continuously and higher columns
 * turn over only on carry. Both values should have the same number of digits.
 */
export const CountUp: React.FC<{
  from: number;
  to: number;
  start?: number;
  duration?: number;
  prefix?: string;
  style?: React.CSSProperties;
}> = ({ from, to, start = 0, duration = 30, prefix = '', style }) => {
  const frame = useCurrentFrame();
  const valueAt = (f: number) =>
    interpolate(f, [start, start + duration], [from, to], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const value = valueAt(frame);
  const speed = Math.abs(value - valueAt(frame - 1));
  const places = placesOf(Math.max(from, to));

  const columns: React.ReactNode[] = [];
  for (let place = places - 1; place >= 0; place--) {
    columns.push(<DigitColumn key={`d${place}`} position={odometer(value, place)} blur={place === 0 ? speed * 6 : 0} />);
    if (place > 0 && place % 3 === 0) columns.push(<Glyph key={`c${place}`}>,</Glyph>);
  }
  return (
    <RollRow style={style}>
      {prefix ? <Glyph>{prefix}</Glyph> : null}
      {columns}
    </RollRow>
  );
};

/**
 * Rolls each digit column straight from its digit in `from` to its digit in `to`, left to right with
 * a stagger. Columns that exist in only one of the numbers collapse or expand in width.
 */
export const NumberMorph: React.FC<{
  from: number;
  to: number;
  start?: number;
  stagger?: number;
  prefix?: string;
  style?: React.CSSProperties;
}> = ({ from, to, start = 0, stagger = 3, prefix = '', style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = Math.floor(from).toString();
  const b = Math.floor(to).toString();
  const places = Math.max(a.length, b.length);
  const digitAt = (s: string, place: number) => (place < s.length ? Number(s[s.length - 1 - place]) : null);
  const progressAt = (f: number, index: number) =>
    spring({ frame: f - start - index * stagger, fps, config: springs.smooth });

  const columns: React.ReactNode[] = [];
  for (let place = places - 1; place >= 0; place--) {
    const index = places - 1 - place;
    const t = progressAt(frame, index);
    const speed = Math.abs(t - progressAt(frame - 1, index));
    const da = digitAt(a, place);
    const db = digitAt(b, place);
    const presence = interpolate(t, [0, 1], [da === null ? 0 : 1, db === null ? 0 : 1]);
    const collapse: React.CSSProperties = {
      maxWidth: `${presence * 0.75}em`,
      opacity: presence,
      overflow: 'hidden',
    };
    const position = interpolate(t, [0, 1], [da ?? db ?? 0, db ?? da ?? 0]);
    columns.push(
      <span key={`d${place}`} style={da === null || db === null ? collapse : undefined}>
        <DigitColumn position={position} blur={Math.abs((db ?? 0) - (da ?? 0)) * speed * 14} />
      </span>,
    );
    if (place > 0 && place % 3 === 0) {
      const ca = a.length > place ? 1 : 0;
      const cb = b.length > place ? 1 : 0;
      const p = interpolate(t, [0, 1], [ca, cb]);
      columns.push(
        <Glyph key={`c${place}`} style={{ maxWidth: `${p * 0.4}em`, opacity: p, overflow: 'hidden' }}>
          ,
        </Glyph>,
      );
    }
  }
  return (
    <RollRow style={style}>
      {prefix ? <Glyph>{prefix}</Glyph> : null}
      {columns}
    </RollRow>
  );
};

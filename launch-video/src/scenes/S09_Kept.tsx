import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { NumberMorph } from '../components/CountUp';
import { colors, fonts } from '../theme';
import { Cents, KeptLabel, labelStyle, NUMBER_Y, numberStyle } from './shared';

const DEDUCTIONS = [
  { at: 10, amount: '$96.30', what: 'payment fees' },
  { at: 20, amount: '$561.70', what: 'tax set aside' },
  { at: 58, amount: '$214.00', what: 'subscriptions' },
];
const FIRST_MORPH = 32;
const SECOND_MORPH = 68;
const LABEL_SWAP = 86;

/** $1,284 → $626 → $412.00 as each deduction attaches. */
export const KeptScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = frame >= SECOND_MORPH;
  const cents = enter(frame, fps, SECOND_MORPH + 14, 'smooth');
  const swap = enter(frame, fps, LABEL_SWAP, 'smooth');
  const listOut = ramp(frame, [92, 102], [0, 1]);
  const emphasis = 1 + 0.05 * enter(frame, fps, LABEL_SWAP + 4, 'smooth');

  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, fontFamily: fonts.sans, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${NUMBER_Y}px)` }}>
        <div style={{ position: 'relative', height: labelStyle.fontSize as number * 1.25, width: 1200 }}>
          <div style={{ ...labelStyle, position: 'absolute', inset: 0, textAlign: 'center', opacity: 1 - swap, transform: `translateY(${-swap * 30}px)` }}>
            Total earned today
          </div>
          <div style={{ ...labelStyle, position: 'absolute', inset: 0, textAlign: 'center', color: colors.inkOnLight, opacity: swap, transform: `translateY(${(1 - swap) * 30}px)` }}>
            <KeptLabel />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', transform: `scale(${emphasis})` }}>
          {second ? (
            <NumberMorph from={626} to={412} start={SECOND_MORPH} prefix="$" style={numberStyle} />
          ) : (
            <NumberMorph from={1284} to={626} start={FIRST_MORPH} prefix="$" style={numberStyle} />
          )}
          <Cents progress={cents} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 540 + NUMBER_Y + 230, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {DEDUCTIONS.map(({ at, amount, what }) => {
          const p = enter(frame, fps, at, 'snappy');
          return (
            <div
              key={what}
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: colors.accent,
                whiteSpace: 'nowrap',
                opacity: p * (1 - listOut),
                transform: `translateX(${(1 - p) * 120}px) translateY(${listOut * 30}px)`,
              }}
            >
              − {amount} <span style={{ fontWeight: 500, opacity: 0.8 }}>{what}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

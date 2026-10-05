import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AccentWord } from './components/AccentWord';
import { CountUp, NumberMorph } from './components/CountUp';
import { Logo } from './components/Logo';
import { buildParticles, Particles } from './components/Particles';
import { PhoneMockup } from './components/PhoneMockup';
import { AmountCard, ServiceLabel, TabCard } from './components/TabCard';
import { TypeWriter } from './components/TypeWriter';
import { SERVICES } from './data';
import { colors, fonts } from './theme';

const particles = buildParticles({
  sources: [
    { x: 40, y: 40, color: SERVICES.stripe.color },
    { x: 360, y: 60, color: SERVICES.etsy.color },
    { x: 60, y: 300, color: SERVICES.upwork.color },
  ],
  target: { x: 260, y: 200 },
  count: 60,
  start: 0,
  spread: 20,
  travel: [20, 30],
});

/** Dev-only sheet of every shared component, for `remotion still Gallery`. Not part of the film. */
export const Gallery: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, fontFamily: fonts.sans, color: colors.inkOnLight }}>
      <div style={{ position: 'absolute', left: 60, top: 40, fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em' }}>
        <CountUp from={1280} to={1284} start={0} duration={30} prefix="$" />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 220, fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em' }}>
        <NumberMorph from={1284} to={626} start={0} prefix="$" />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 420, fontSize: 64, fontWeight: 800 }}>
        over <AccentWord>here.</AccentWord> What you <AccentWord>actually</AccentWord> kept
      </div>
      <div style={{ position: 'absolute', left: 60, top: 540, padding: '24px 40px', borderRadius: 60, backgroundColor: colors.dark, color: colors.inkOnDark, fontSize: 48 }}>
        <TypeWriter text="did i make money today" start={0} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 680 }}>
        <Logo height={110} delay={0} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 860, display: 'flex', gap: 20 }}>
        <ServiceLabel service={SERVICES.stripe} />
        <ServiceLabel service={SERVICES.gumroad} />
      </div>
      <div style={{ position: 'absolute', left: 820, top: 40, padding: 30, backgroundColor: colors.dark, borderRadius: 24, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <TabCard service={SERVICES.stripe} title="Payouts – Stripe" />
        <AmountCard service={SERVICES.paypal} label="Balance" amount="$847.12" size="sm" />
      </div>
      <div style={{ position: 'absolute', left: 820, top: 380 }}>
        <AmountCard service={SERVICES.stripe} label="Gross volume" amount="$1,284.00" tone="light" style={{ transform: 'scale(0.8)', transformOrigin: 'top left' }} />
      </div>
      <div style={{ position: 'absolute', left: 1500, top: 300 }}>
        <PhoneMockup width={340}>
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, #F6C9A0, #C9502A)' }} />
        </PhoneMockup>
      </div>
      <div style={{ position: 'absolute', left: 820, top: 760, width: 400, height: 300, border: '1px dashed #ccc' }}>
        <Particles particles={particles} />
        <div style={{ position: 'absolute', left: 4, top: 4, fontSize: 20, color: colors.mutedOnLight }}>frame {frame}</div>
      </div>
    </AbsoluteFill>
  );
};

import type { Service } from '../data';
import { colors, fonts } from '../theme';

type Tone = 'dark' | 'light';

const palette = (tone: Tone) =>
  tone === 'dark'
    ? { bg: colors.cardOnDark, border: colors.cardBorderOnDark, ink: colors.inkOnDark, muted: colors.mutedOnDark, chrome: '#191622', skeleton: '#2E2A3A' }
    : { bg: colors.cardOnLight, border: colors.cardBorderOnLight, ink: colors.inkOnLight, muted: colors.mutedOnLight, chrome: '#F1EEE7', skeleton: '#ECE8DF' };

/** Rounded-square favicon with the service's initial. */
export const Favicon: React.FC<{ service: Service; size: number }> = ({ service, size }) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: size * 0.28,
      backgroundColor: service.color,
      color: service.glyphInk ?? '#FFFFFF',
      fontFamily: fonts.sans,
      fontWeight: 800,
      fontSize: size * 0.62,
      lineHeight: `${size}px`,
      textAlign: 'center',
    }}
  >
    {service.glyph}
  </div>
);

/** Small coloured dot + service name, the "label" used in the light half. */
export const ServiceLabel: React.FC<{ service: Service; size?: number; style?: React.CSSProperties }> = ({
  service,
  size = 30,
  style,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.45,
      padding: `${size * 0.45}px ${size * 0.8}px`,
      borderRadius: 999,
      backgroundColor: colors.cardOnLight,
      border: `2px solid ${colors.cardBorderOnLight}`,
      boxShadow: '0 10px 30px rgba(20,18,28,0.06)',
      fontFamily: fonts.sans,
      fontWeight: 600,
      fontSize: size,
      color: colors.inkOnLight,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <span style={{ width: size * 0.5, height: size * 0.5, borderRadius: '50%', backgroundColor: service.color }} />
    {service.name}
  </div>
);

/** A miniature browser window: one tab, an address bar and a skeleton page. */
export const TabCard: React.FC<{
  service: Service;
  title: string;
  tone?: Tone;
  width?: number;
  style?: React.CSSProperties;
}> = ({ service, title, tone = 'dark', width = 360, style }) => {
  const c = palette(tone);
  const u = width / 360;
  return (
    <div
      style={{
        width,
        borderRadius: 18 * u,
        backgroundColor: c.bg,
        border: `${2 * u}px solid ${c.border}`,
        boxShadow: tone === 'dark' ? '0 24px 60px rgba(0,0,0,0.45)' : '0 24px 60px rgba(20,18,28,0.10)',
        overflow: 'hidden',
        fontFamily: fonts.sans,
        ...style,
      }}
    >
      <div style={{ backgroundColor: c.chrome, padding: `${10 * u}px ${12 * u}px 0` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10 * u,
            width: '78%',
            height: 44 * u,
            padding: `0 ${12 * u}px`,
            borderRadius: `${12 * u}px ${12 * u}px 0 0`,
            backgroundColor: c.bg,
          }}
        >
          <Favicon service={service} size={20 * u} />
          <span
            style={{
              flex: 1,
              fontSize: 17 * u,
              fontWeight: 600,
              color: c.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 18 * u, color: c.muted }}>×</span>
        </div>
      </div>
      <div style={{ padding: `${12 * u}px ${16 * u}px ${18 * u}px` }}>
        <div style={{ height: 22 * u, borderRadius: 11 * u, backgroundColor: c.skeleton, opacity: 0.7 }} />
        <div style={{ display: 'flex', gap: 10 * u, marginTop: 16 * u }}>
          <div style={{ width: 54 * u, height: 54 * u, borderRadius: 12 * u, backgroundColor: service.color, opacity: 0.85 }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: '70%', height: 14 * u, borderRadius: 7 * u, backgroundColor: c.skeleton }} />
            <div style={{ width: '92%', height: 14 * u, borderRadius: 7 * u, backgroundColor: c.skeleton, marginTop: 10 * u }} />
            <div style={{ width: '48%', height: 14 * u, borderRadius: 7 * u, backgroundColor: c.skeleton, marginTop: 10 * u }} />
          </div>
        </div>
      </div>
    </div>
  );
};

/** Dashboard tile with a service label and an amount. `lg` for hero cards, `sm` for the vortex. */
export const AmountCard: React.FC<{
  service: Service;
  label: string;
  amount: string;
  size?: 'lg' | 'sm';
  tone?: Tone;
  style?: React.CSSProperties;
}> = ({ service, label, amount, size = 'lg', tone = 'dark', style }) => {
  const c = palette(tone);
  const lg = size === 'lg';
  const u = lg ? 1 : 0.42;
  return (
    <div
      style={{
        width: 620 * u,
        padding: `${40 * u}px ${44 * u}px`,
        borderRadius: 32 * u,
        backgroundColor: c.bg,
        border: `${Math.max(1.5, 2 * u)}px solid ${c.border}`,
        boxShadow: tone === 'dark' ? `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.5)` : '0 30px 80px rgba(20,18,28,0.10)',
        fontFamily: fonts.sans,
        color: c.ink,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontSize: 26 * u, fontWeight: 600, color: c.muted }}>
        <Favicon service={service} size={34 * u} />
        <span style={{ whiteSpace: 'nowrap' }}>
          {service.name} · {label}
        </span>
      </div>
      <div
        style={{
          marginTop: 22 * u,
          fontSize: 104 * u,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {amount}
      </div>
      {lg ? (
        <svg width="100%" height="70" viewBox="0 0 532 70" preserveAspectRatio="none" style={{ marginTop: 26, display: 'block' }}>
          <path
            d="M0 58 L48 52 L96 56 L144 40 L192 44 L240 30 L288 36 L336 22 L384 28 L432 14 L480 18 L532 6"
            fill="none"
            stroke={service.color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
};

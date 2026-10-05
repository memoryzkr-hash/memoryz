import { useId } from 'react';

/**
 * Axis-aligned motion blur via an SVG Gaussian filter, so a horizontal whip only smears horizontally.
 * `x` / `y` are standard deviations in px; values near 0 disable the filter.
 */
export const DirectionalBlur: React.FC<{
  x?: number;
  y?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ x = 0, y = 0, style, children }) => {
  const id = `dblur-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const active = Math.abs(x) > 0.2 || Math.abs(y) > 0.2;
  return (
    <>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={`${Math.abs(x)} ${Math.abs(y)}`} />
          </filter>
        </defs>
      </svg>
      <div style={{ ...style, filter: active ? `url(#${id})` : undefined }}>{children}</div>
    </>
  );
};

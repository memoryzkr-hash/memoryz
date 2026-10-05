/** iPhone-style frame drawn with CSS. Children fill the screen. */
export const PhoneMockup: React.FC<{ width: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  width,
  children,
  style,
}) => {
  const height = width * 2.05;
  const bezel = width * 0.034;
  const button = (side: 'left' | 'right', top: number, length: number): React.CSSProperties => ({
    position: 'absolute',
    [side]: -width * 0.012,
    top: height * top,
    width: width * 0.014,
    height: height * length,
    borderRadius: width * 0.01,
    backgroundColor: '#2A2730',
  });
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: width * 0.165,
        padding: bezel,
        background: 'linear-gradient(145deg, #3A3640 0%, #17151C 45%, #2B2830 100%)',
        boxShadow: `0 ${width * 0.12}px ${width * 0.25}px rgba(60,30,10,0.28), inset 0 0 0 ${width * 0.006}px rgba(255,255,255,0.12)`,
        ...style,
      }}
    >
      <div style={button('left', 0.17, 0.045)} />
      <div style={button('left', 0.25, 0.08)} />
      <div style={button('left', 0.35, 0.08)} />
      <div style={button('right', 0.27, 0.12)} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: width * 0.135,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
        {/* Dynamic Island */}
        <div
          style={{
            position: 'absolute',
            top: width * 0.03,
            left: '50%',
            width: width * 0.3,
            height: width * 0.085,
            transform: 'translateX(-50%)',
            borderRadius: width,
            backgroundColor: '#000',
          }}
        />
        {/* Glass sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(120deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 35%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

import { Audio, getStaticFiles, interpolate, staticFile, useVideoConfig } from 'remotion';

const TRACK = 'music.mp3';

/** Plays public/music.mp3 if it exists (fades in/out); otherwise the film is silent. */
export const Soundtrack: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  if (!getStaticFiles().some((f) => f.name === TRACK)) return null;
  return (
    <Audio
      src={staticFile(TRACK)}
      volume={(f) =>
        interpolate(f, [0, 10, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};

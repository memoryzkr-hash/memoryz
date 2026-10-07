import { Audio, getStaticFiles, interpolate, staticFile, useVideoConfig } from 'remotion';

const has = (name: string) => getStaticFiles().some((f) => f.name === name);

/**
 * Music: public/music.mp3 if you drop one in, otherwise the generated bed (public/audio/music.wav).
 * Sound effects and narration: public/audio/sfx.wav and vo.wav. All generated files come from `npm run sound`.
 */
export const Soundtrack: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const custom = has('music.mp3');
  const music = custom ? 'music.mp3' : has('audio/music.wav') ? 'audio/music.wav' : null;
  return (
    <>
      {music ? (
        <Audio
          src={staticFile(music)}
          volume={(f) =>
            // A supplied track gets faded to the film's length; the generated bed already is.
            custom
              ? interpolate(f, [0, 10, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1
          }
        />
      ) : null}
      {has('audio/sfx.wav') ? <Audio src={staticFile('audio/sfx.wav')} /> : null}
      {has('audio/vo.wav') ? <Audio src={staticFile('audio/vo.wav')} /> : null}
    </>
  );
};

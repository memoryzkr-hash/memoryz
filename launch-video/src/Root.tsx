import { Composition } from 'remotion';
import { Video } from './Video';
import { TOTAL_FRAMES } from './timeline';
import { VIDEO } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    durationInFrames={TOTAL_FRAMES}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);

import { Composition, Folder } from 'remotion';
import { Gallery } from './Gallery';
import { Video } from './Video';
import { TOTAL_FRAMES } from './timeline';
import { VIDEO } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
    id="Video"
    component={Video}
    durationInFrames={TOTAL_FRAMES}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
    />
    <Folder name="Dev">
      <Composition id="Gallery" component={Gallery} durationInFrames={60} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height} />
    </Folder>
  </>
);

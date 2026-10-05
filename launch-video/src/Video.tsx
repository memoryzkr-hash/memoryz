import { Series } from 'remotion';
import { SCENES, type SceneId } from './timeline';
import { ClockScene } from './scenes/S01_Clock';
import { TabsScene } from './scenes/S02_Tabs';
import { SearchScene } from './scenes/S03_Search';
import { HereThereScene } from './scenes/S04_HereThere';
import { EverywhereScene } from './scenes/S05_Everywhere';
import { FlashScene } from './scenes/S06_Flash';
import { ParticlesScene } from './scenes/S07_Particles';
import { CountUpScene } from './scenes/S08_CountUp';
import { KeptScene } from './scenes/S09_Kept';
import { SubsScene } from './scenes/S10_Subs';
import { MorningScene } from './scenes/S11_Morning';
import { SloganScene } from './scenes/S12_Slogan';
import { OutroScene } from './scenes/S13_Outro';

const sceneComponents: Record<SceneId, React.FC> = {
  S01_Clock: ClockScene,
  S02_Tabs: TabsScene,
  S03_Search: SearchScene,
  S04_HereThere: HereThereScene,
  S05_Everywhere: EverywhereScene,
  S06_Flash: FlashScene,
  S07_Particles: ParticlesScene,
  S08_CountUp: CountUpScene,
  S09_Kept: KeptScene,
  S10_Subs: SubsScene,
  S11_Morning: MorningScene,
  S12_Slogan: SloganScene,
  S13_Outro: OutroScene,
};

export const Video: React.FC = () => (
  <Series>
    {SCENES.map(({ id, duration }) => {
      const Scene = sceneComponents[id];
      return (
        <Series.Sequence key={id} name={id} durationInFrames={duration}>
          <Scene />
        </Series.Sequence>
      );
    })}
  </Series>
);

import type { RideState } from '../core/sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');
const km = (m: number) => `${(m / 1000).toFixed(2)} km`;

/** All DOM-side UI: HUD numbers, popups, overlays and the webcam status line. */
export class Hud {
  readonly title = $('title');
  readonly calib = $('calib');
  readonly wasted = $('wasted');
  readonly hud = $('hud');
  readonly cam = $('cam');
  readonly video = $<HTMLVideoElement>('video');
  readonly skel = $<HTMLCanvasElement>('skel');
  readonly playCam = $<HTMLButtonElement>('play-cam');
  readonly playKeys = $<HTMLButtonElement>('play-keys');
  readonly calibSkip = $<HTMLButtonElement>('calib-skip');
  readonly mute = $<HTMLButtonElement>('mute');
  private score = $('score');
  private dist = $('dist');
  private combo = $('combo');
  private best = $('best');
  private boostFill = $('boost-fill');
  private boostLabel = $('boost-label');
  private popups = $('popups');
  private center = $('center-msg');
  private camStatus = $('cam-status');
  private titleStatus = $('title-status');
  private calibFill = $('calib-fill');
  private restartFill = $('restart-fill');
  private restartHint = $('restart-hint');
  private lastCenter = '';

  show(screen: 'title' | 'calib' | 'ride' | 'wasted'): void {
    this.title.hidden = screen !== 'title';
    this.calib.hidden = screen !== 'calib';
    this.wasted.hidden = screen !== 'wasted';
    this.hud.hidden = screen === 'title' || screen === 'calib';
    this.cam.classList.toggle('big', screen === 'calib');
  }

  titleMessage(text: string, error = false): void {
    this.titleStatus.textContent = text;
    this.titleStatus.classList.toggle('error', error);
  }

  setBest(best: number): void {
    this.best.textContent = `최고 ${fmt(best)}`;
  }

  setMuted(muted: boolean): void {
    this.mute.textContent = muted ? '🔇' : '🔊';
  }

  update(state: RideState, usingPose: boolean): void {
    this.score.textContent = fmt(state.score);
    this.dist.textContent = km(state.bike.z);
    this.combo.textContent = state.combo > 1 ? `콤보 x${state.combo}` : '';
    this.boostFill.style.width = `${Math.round(state.boost * 100)}%`;
    this.boostFill.classList.toggle('on', state.bike.boosting);
    this.boostLabel.textContent = state.bike.boosting ? 'BOOST!' : usingPose ? 'BOOST · 몸을 숙이세요' : 'BOOST · Space';
  }

  centerMessage(text: string, small = false): void {
    const key = `${text}|${small}`;
    if (key === this.lastCenter) return;
    this.lastCenter = key;
    this.center.textContent = text;
    this.center.classList.toggle('small', small);
  }

  popup(text: string, warn = false): void {
    const el = document.createElement('div');
    el.className = warn ? 'popup warn' : 'popup';
    el.textContent = text;
    el.style.left = `${(Math.random() - 0.5) * 120}px`;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  camMessage(text: string, kind: 'ok' | 'warn' | '' = ''): void {
    if (this.camStatus.textContent !== text) this.camStatus.textContent = text;
    this.camStatus.className = kind;
  }

  calibProgress(k: number): void {
    this.calibFill.style.width = `${Math.round(k * 100)}%`;
  }

  showWasted(state: RideState, newBest: boolean, usingPose: boolean): void {
    $('st-score').textContent = fmt(state.score);
    $('st-dist').textContent = km(state.bike.z);
    $('st-speed').textContent = `${Math.round(state.topSpeed * 3.6)} km/h`;
    $('st-miss').textContent = `${state.nearMisses}회`;
    $('st-combo').textContent = `x${state.bestCombo}`;
    $('new-best').hidden = !newBest;
    this.restartHint.textContent = usingPose ? '🙌 두 손을 머리 위로 올리면 다시 시작 (R 키 · 탭)' : 'R 키 · Enter · 화면 탭으로 다시 시작';
    this.restartProgress(0);
    // Restart the entrance animation.
    const text = this.wasted.querySelector('.wasted-text') as HTMLElement;
    text.style.animation = 'none';
    void text.offsetWidth;
    text.style.animation = '';
    this.show('wasted');
  }

  restartProgress(k: number): void {
    this.restartFill.style.width = `${Math.round(k * 100)}%`;
  }
}

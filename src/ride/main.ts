import './ride.css';
import { autopilot } from './core/autopilot';
import { DT } from './core/constants';
import { PoseControls, type PoseControlsOutput } from './core/controls';
import { isWasted, newRide, step, timeScale, type RideInput, type RideState } from './core/sim';
import { RideAudio } from './audio';
import { KeyControls } from './input/keyboard';
import type { PoseTracker } from './input/pose';
import { RideRenderer } from './render/scene';
import { Hud } from './ui/hud';
import { drawSkeleton } from './ui/skeleton';

type Mode = 'title' | 'calibrate' | 'countdown' | 'ride' | 'crashed';

const BEST_KEY = 'neon-rider.best';
const COUNTDOWN = 3;

const hud = new Hud();
const stage = document.getElementById('stage')!;
const renderer = new RideRenderer(stage);
const audio = new RideAudio();
const keys = new KeyControls(stage);
const poseControls = new PoseControls();

let mode: Mode = 'title';
let state: RideState = newRide();
let tracker: PoseTracker | null = null;
let poseOut: PoseControlsOutput | null = null;
let usingPose = false;
let countdown = 0;
let acc = 0;
let wastedShownAt = -1;
let clock = 0;
let best = loadBest();
/** Set `__ride.fixedDt` from automation to advance the game by a fixed step per frame. */
const debug = { fixedDt: 0 };

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): boolean {
  if (score <= best) return false;
  best = Math.floor(score);
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Kept for this session only.
  }
  hud.setBest(best);
  return true;
}

hud.setBest(best);
hud.setMuted(audio.muted);
hud.show('title');

/** False when the page is embedded somewhere that blocks the camera (Chromium reports this up front). */
function cameraAllowed(): boolean {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  const policy = (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
  return policy ? policy.allowsFeature('camera') : true;
}
if (!cameraAllowed()) {
  hud.playCam.disabled = true;
  hud.titleMessage('이 화면에서는 카메라를 쓸 수 없어요. 키보드나 터치로 플레이하세요.');
}

function startCountdown(): void {
  state = newRide();
  acc = 0;
  wastedShownAt = -1;
  countdown = COUNTDOWN;
  mode = 'countdown';
  hud.show('ride');
  audio.beep(false);
}

async function startWithCamera(): Promise<void> {
  audio.unlock();
  hud.playCam.disabled = hud.playKeys.disabled = true;
  hud.cam.hidden = false;
  try {
    if (!tracker) {
      hud.titleMessage('자세 인식 기능을 불러오는 중…');
      // Loaded on demand so keyboard players never download MediaPipe.
      const { PoseTracker } = await import('./input/pose').catch(() => {
        throw new Error('자세 인식 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
      });
      tracker = await PoseTracker.start(hud.video, (msg) => hud.titleMessage(msg));
    }
    usingPose = true;
    poseControls.recalibrate();
    hud.titleMessage('');
    mode = 'calibrate';
    hud.show('calib');
  } catch (e) {
    hud.cam.hidden = true;
    hud.titleMessage(`${(e as Error).message} 키보드로도 플레이할 수 있어요.`, true);
  } finally {
    hud.playKeys.disabled = false;
    hud.playCam.disabled = !cameraAllowed();
  }
}

function startWithKeys(): void {
  audio.unlock();
  usingPose = false;
  hud.cam.hidden = !tracker;
  startCountdown();
}

hud.playCam.addEventListener('click', () => void startWithCamera());
hud.playKeys.addEventListener('click', startWithKeys);
hud.calibSkip.addEventListener('click', startWithKeys);
hud.mute.addEventListener('click', () => hud.setMuted(audio.toggleMute()));
keys.onMute = () => hud.setMuted(audio.toggleMute());
keys.onAction = () => {
  audio.unlock();
  if (mode === 'title') startWithKeys();
  else if (mode === 'crashed' && wastedShownAt >= 0 && clock - wastedShownAt > 0.8) startCountdown();
};
hud.wasted.addEventListener('click', () => keys.onAction?.());

function currentInput(): RideInput {
  if (mode === 'title' || mode === 'calibrate') return autopilot(state);
  if (usingPose && poseOut) {
    const i = { ...poseOut.input };
    if (keys.steer !== 0) i.steer = keys.steer;
    if (keys.boost) i.boost = true;
    if (keys.brake) i.brake = true;
    return i;
  }
  return { steer: keys.steer, throttle: keys.brake ? 0 : 1, brake: keys.brake, boost: keys.boost };
}

function updatePose(): void {
  if (!tracker) return;
  const dt = tracker.poll();
  if (dt === 0) return;
  poseOut = poseControls.update(tracker.latest, dt);
  drawSkeleton(hud.skel, hud.video, tracker.latest, poseOut.reading, poseOut.input.steer);

  const r = poseOut.reading;
  if (!r.tracked) hud.camMessage('카메라에 상체가 보이게 해 주세요', 'warn');
  else if (r.handsUp) hud.camMessage(`🙌 ${Math.round(poseOut.handsUpProgress * 100)}%`, 'ok');
  else if (!r.grip) hud.camMessage('✊✊ 두 주먹으로 핸들을 잡으세요', 'warn');
  else if (poseOut.calibration < 1) hud.camMessage(`보정 중… ${Math.round(poseOut.calibration * 100)}%`, 'ok');
  else hud.camMessage(poseOut.tuck ? '🔥 부스터!' : '주행 중', 'ok');

  if (poseOut.handsUpFired && mode === 'crashed' && wastedShownAt >= 0) startCountdown();
}

function handleEvents(): void {
  const events = state.events;
  if (!events.length) return;
  renderer.handle(events, state);
  if (mode === 'ride' || mode === 'crashed') {
    for (const e of events) {
      if (e.type === 'nearMiss') {
        audio.nearMiss(e.combo);
        hud.popup(e.combo > 1 ? `아슬아슬! +${e.points}  x${e.combo}` : `아슬아슬! +${e.points}`);
      } else if (e.type === 'scrape') {
        audio.scrape();
        hud.popup('가드레일!', true);
      } else if (e.type === 'crash') {
        audio.crash();
      } else if (e.type === 'bounce') {
        audio.bounce(e.speed);
      }
    }
  }
  state.events.length = 0;
}

let last = performance.now();
function frame(now: number): void {
  const dt = debug.fixedDt || Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;

  updatePose();
  const input = currentInput();

  switch (mode) {
    case 'title':
    case 'calibrate': {
      // Attract mode: an autopilot rides behind the menus, and quietly starts over after a crash.
      if (state.crash && state.crash.t > 2.5) state = newRide();
      if (mode === 'calibrate') {
        hud.calibProgress(poseOut?.calibration ?? 0);
        if (poseControls.calibrated) startCountdown();
      }
      break;
    }
    case 'countdown': {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const after = Math.ceil(countdown);
      if (countdown <= 0) {
        mode = 'ride';
        hud.centerMessage('GO!');
        audio.beep(true);
      } else {
        if (after !== before) audio.beep(false);
        hud.centerMessage(String(after));
      }
      break;
    }
    case 'ride':
      if (state.phase === 'crashed') mode = 'crashed';
      if (usingPose && input.throttle === 0) hud.centerMessage('✊✊ 핸들을 잡으세요', true);
      else if (state.time > 0.7) hud.centerMessage('');
      break;
    case 'crashed':
      hud.centerMessage('');
      if (isWasted(state) && wastedShownAt < 0) {
        wastedShownAt = clock;
        const newBest = saveBest(state.score);
        hud.showWasted(state, newBest, usingPose);
        audio.wasted();
      }
      if (wastedShownAt >= 0) hud.restartProgress(poseOut?.handsUpProgress ?? 0);
      break;
  }

  if (mode !== 'countdown') {
    acc += dt * timeScale(state);
    let steps = 0;
    while (acc >= DT && steps < 12) {
      step(state, input);
      acc -= DT;
      steps++;
    }
    if (steps === 12) acc = 0;
  }
  handleEvents();

  const riding = mode === 'ride' || mode === 'countdown';
  if (riding || mode === 'crashed') hud.update(state, usingPose);
  audio.update(state.bike.speed * 3.6, riding ? input.throttle : 0, state.bike.boosting, riding && state.phase === 'riding');
  renderer.render(state, input.steer, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging and automated checks.
Object.assign(window, {
  __ride: {
    get state() { return state; },
    get mode() { return mode; },
    get pose() { return poseOut; },
    set fixedDt(v: number) { debug.fixedDt = v; },
  },
});

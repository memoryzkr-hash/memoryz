import './beat.css';
import { ClickTrack, SongPlayer, AudioEngine } from './audio/music';
import { idealInputs, type BuiltLevel, type InputEvent } from './core/chart';
import { SPEED, START_BEAT } from './core/constants';
import { Judge, type Grade, type JudgeState } from './core/judge';
import { levelFor, STAGES, type StageDef } from './core/levels';
import { cloneRun, newRun, press, release, step, type RunState } from './core/physics';
import {
  loadRecords, loadSettings, mergeRecord, saveRecords, saveSettings, syncOffset, type StageRecord,
} from './core/records';
import { Renderer } from './render/draw';
import { $, fillResult, renderStages, show } from './ui/screens';

type Mode = 'title' | 'play' | 'paused' | 'result' | 'sync';

interface Checkpoint { run: RunState; judge: JudgeState }

interface Session {
  stage: StageDef;
  level: BuiltLevel;
  judge: Judge;
  run: RunState;
  player: SongPlayer;
  attempt: number;
  practice: boolean;
  /** Beat the song is counting in to; the run is frozen before it. */
  countInUntil: number;
  checkpoint: Checkpoint | null;
  nextCheckpoint: number;
  marks: number[];
  deadAt: number | null;
  finishedAt: number | null;
  /** Beat of the last frame, for drawing. */
  beat: number;
}

const CHECKPOINT_EVERY = 16;
const RESTART_AFTER_MS = 900;
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX']);
const GRADE_TEXT: Record<Grade, string> = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const GRADE_COLOR: Record<Grade, string> = { perfect: '#ffffff', great: '#ffe14a', good: '#9fe8ff', miss: '#ff8a8a' };

const engine = new AudioEngine();
const renderer = new Renderer($('stage'));
let settings = loadSettings();
let records: Record<string, StageRecord> = loadRecords();
let mode: Mode = 'title';
let session: Session | null = null;
let lastFrame = performance.now();
const queue: { time: number; type: 'press' | 'release' }[] = [];

engine.setMuted(settings.muted);

// ---------------------------------------------------------------- title demo

/** Stage 1 played perfectly behind the title screen, on the page clock, silently. */
const demo = {
  stage: STAGES[0],
  level: levelFor(STAGES[0]),
  run: newRun(),
  judge: new Judge([], 1),
  inputs: [] as InputEvent[],
  next: 0,
  t0: 0,
};

function resetDemo(now: number): void {
  demo.run = newRun();
  demo.judge = new Judge(demo.level.notes, demo.stage.bpm);
  demo.inputs = idealInputs(demo.level);
  demo.next = 0;
  demo.t0 = now;
  renderer.reset();
}

function demoFrame(now: number, dt: number): void {
  const beat = START_BEAT + ((now - demo.t0) / 1000) * (demo.stage.bpm / 60);
  const { run, level } = demo;
  while (demo.next < demo.inputs.length && demo.inputs[demo.next].beat <= beat) {
    const input = demo.inputs[demo.next++];
    while (run.t < input.beat - 1e-9 && !run.dead && !run.finished) step(run, level.world);
    if (input.type === 'press') press(run, level.world);
    else release(run);
  }
  while (run.t < beat - 1e-9 && !run.dead && !run.finished) step(run, level.world);
  for (const e of run.events) {
    if (e.type === 'jump' || e.type === 'orb') demo.judge.hit(e.t, e.type);
    if (e.type === 'land') renderer.landed(e.t, e.x, e.y, e.impact, demo.stage.palette.edge);
  }
  run.events.length = 0;
  renderer.render({ stage: demo.stage, level, run, beat: Math.max(beat, START_BEAT), guide: true, judged: demo.judge.state.judged, hud: null, countIn: null, deadFor: -1 }, dt);
  if (run.finished || run.dead || beat > level.endBeat + 2) resetDemo(now);
}

// ---------------------------------------------------------------- sessions

function startStage(stage: StageDef): void {
  engine.unlock();
  const level = levelFor(stage);
  session?.player.stop();
  session = {
    stage, level, judge: new Judge(level.notes, stage.bpm), run: newRun(), player: new SongPlayer(engine, stage, level),
    attempt: 0, practice: settings.practice, countInUntil: 0, checkpoint: null, nextCheckpoint: CHECKPOINT_EVERY,
    marks: [], deadAt: null, finishedAt: null, beat: START_BEAT,
  };
  document.documentElement.style.setProperty('--accent', stage.palette.accent);
  beginAttempt();
}

/** A fresh attempt: from the top, or in practice from the last checkpoint after a one-bar count-in. */
function beginAttempt(): void {
  const s = session!;
  s.player.stop();
  s.player = new SongPlayer(engine, s.stage, s.level);
  s.attempt++;
  s.deadAt = null;
  s.finishedAt = null;
  queue.length = 0;
  renderer.reset();
  if (s.practice && s.checkpoint) {
    s.run = cloneRun(s.checkpoint.run);
    s.judge.restore(s.checkpoint.judge);
    s.countInUntil = s.run.t;
    s.player.start(s.run.t - 4, s.run.t);
  } else {
    s.run = newRun();
    s.judge = new Judge(s.level.notes, s.stage.bpm);
    s.checkpoint = null;
    s.nextCheckpoint = CHECKPOINT_EVERY;
    s.marks = [];
    s.countInUntil = 0;
    s.player.start(START_BEAT, 0);
  }
  mode = 'play';
  show(null);
}

/** Song beat the player is hearing at page time `perfMs`, corrected by the sync setting. */
function heardBeat(s: Session, perfMs: number): number {
  return s.player.beatAt(engine.heardTimeAt(perfMs) - settings.offsetMs / 1000);
}

/** Steps the run to beat `to`, saving practice checkpoints on the way. */
function advance(s: Session, to: number): void {
  const run = s.run;
  while (run.t < to - 1e-9 && !run.dead && !run.finished) {
    step(run, s.level.world);
    if (s.practice && run.t >= s.nextCheckpoint && run.grounded && Number.isInteger(run.t)) {
      const saved = cloneRun(run);
      saved.holding = false;
      saved.pressAt = -Infinity;
      s.checkpoint = { run: saved, judge: s.judge.snapshot() };
      s.marks.push(Math.min(1, (run.t * SPEED) / s.level.world.endX));
      s.nextCheckpoint = run.t + CHECKPOINT_EVERY;
    }
  }
}

function playFrame(now: number, dt: number): void {
  const s = session!;
  s.player.pump();
  // The audio clock is suspended while paused; hold the picture still too.
  const beatNow = mode === 'paused' ? s.beat : heardBeat(s, now);
  const run = s.run;

  if (mode === 'play' && s.deadAt === null && s.finishedAt === null) {
    for (const input of queue.splice(0)) {
      const b = heardBeat(s, input.time);
      if (b > run.t) advance(s, Math.min(b, beatNow));
      if (input.type === 'press') {
        if (b >= s.countInUntil - 0.25 || s.countInUntil <= 0) press(run, s.level.world);
      } else release(run);
    }
    if (beatNow >= s.countInUntil || s.countInUntil <= 0) advance(s, beatNow);
    handleEvents(s, now);
    if (s.judge.sweep(run.t).length) renderer.popup('MISS', '', GRADE_COLOR.miss, run.y);
  } else queue.length = 0;

  // After the finish line the ball keeps rolling out with the music for a couple of bars.
  if (s.finishedAt !== null && run.grounded) {
    run.t = Math.min(Math.max(run.t, beatNow), s.level.endBeat + 8);
    run.x = run.t * SPEED;
  }
  s.beat = beatNow;

  const countIn = beatNow < s.countInUntil ? beatNow - s.countInUntil : null;
  renderer.render({
    stage: s.stage, level: s.level, run, beat: beatNow, guide: settings.guide, judged: s.judge.state.judged,
    hud: {
      attempt: s.attempt, combo: s.judge.state.combo, accuracy: s.judge.accuracy(),
      progress: Math.min(1, Math.max(0, run.x / s.level.world.endX)),
      best: s.practice ? 0 : records[s.stage.id]?.bestPct ?? 0, practice: s.practice, checkpoints: s.marks,
    },
    countIn, deadFor: s.deadAt === null ? -1 : (now - s.deadAt) / 1000,
  }, dt);

  if (s.deadAt !== null && now - s.deadAt > RESTART_AFTER_MS && mode === 'play') beginAttempt();
  if (s.finishedAt !== null && now - s.finishedAt > 900 && mode === 'play') showResult(s);
}

function handleEvents(s: Session, now: number): void {
  const p = s.stage.palette;
  for (const e of s.run.events) {
    if (e.type === 'jump' || e.type === 'orb') {
      if (e.type === 'orb') renderer.sparks(e.x, e.y + 0.4, p.accent);
      const j = s.judge.hit(e.t, e.type);
      if (j) {
        const sub = j.grade === 'perfect' ? '' : j.deltaMs < 0 ? '빠름' : '느림';
        renderer.popup(GRADE_TEXT[j.grade], sub, GRADE_COLOR[j.grade], e.y);
      }
    } else if (e.type === 'pad') renderer.sparks(e.x, e.y, p.accent);
    else if (e.type === 'land') renderer.landed(e.t, e.x, e.y, e.impact, p.edge);
    else if (e.type === 'die') {
      s.deadAt = now;
      s.player.stop(0.02);
      engine.death();
      renderer.shatter(e.x, e.y, [p.ball, p.accent, p.ink]);
      if (!s.practice) {
        const pct = Math.min(1, Math.max(0, e.x / s.level.world.endX));
        const { record } = mergeRecord(records[s.stage.id], { cleared: false, pct });
        records[s.stage.id] = record;
        saveRecords(records);
      }
    } else if (e.type === 'finish') {
      s.finishedAt = now;
      s.judge.sweep(Infinity);
    }
  }
  s.run.events.length = 0;
}

function showResult(s: Session): void {
  mode = 'result';
  const rank = s.judge.rank();
  const accuracy = s.judge.accuracy();
  let improved = false;
  if (!s.practice) {
    const merged = mergeRecord(records[s.stage.id], { cleared: true, rank, accuracy });
    records[s.stage.id] = merged.record;
    improved = merged.improved;
    saveRecords(records);
  }
  const idx = STAGES.indexOf(s.stage);
  fillResult({
    stage: s.stage, rank, accuracy, counts: s.judge.state.counts, maxCombo: s.judge.state.maxCombo,
    attempts: s.attempt, practice: s.practice, improved, hasNext: idx < STAGES.length - 1,
  });
  engine.fanfare(s.stage.song.root);
  show('result');
  $('next').hidden ? $('again').focus() : $('next').focus();
}

function toTitle(): void {
  session?.player.stop();
  session = null;
  mode = 'title';
  void engine.resume();
  renderTitle();
  resetDemo(performance.now());
  show('title');
}

function pause(): void {
  if (mode !== 'play' || !session || session.deadAt !== null || session.finishedAt !== null) return;
  mode = 'paused';
  void engine.suspend();
  show('pause');
  $('resume').focus();
}

function resume(): void {
  if (mode !== 'paused') return;
  void engine.resume();
  mode = 'play';
  queue.length = 0;
  show(null);
}

// ---------------------------------------------------------------- sync screen

let click: ClickTrack | null = null;
let syncDeltas: number[] = [];
const SYNC_BPM = 100;
const SYNC_BEATS = 24;

function openSync(): void {
  mode = 'sync';
  show('sync');
  setSyncRange(settings.offsetMs);
  startSyncRun();
}

function startSyncRun(): void {
  engine.unlock();
  click?.stop();
  click = new ClickTrack(engine, SYNC_BPM, SYNC_BEATS);
  click.start();
  syncDeltas = [];
  $('sync-result').textContent = '측정 중…';
  $('sync-hint').textContent = '딸깍 소리에 맞춰 두드리세요';
  renderSyncDots();
}

function syncTap(time: number): void {
  if (!click) return;
  const b = click.beatAt(engine.heardTimeAt(time));
  if (b < 1.5 || b > SYNC_BEATS) return;
  const ms = (b - Math.round(b)) * click.spb * 1000;
  if (Math.abs(ms) > 250) return;
  syncDeltas.push(ms);
  const pad = $('sync-pad');
  pad.classList.add('flash');
  setTimeout(() => pad.classList.remove('flash'), 90);
  renderSyncDots();
  const off = syncOffset(syncDeltas);
  if (off !== null) {
    setSyncRange(off);
    $('sync-result').textContent = off === 0 ? '딱 맞아요 (0ms)' : `${off > 0 ? '늦게' : '빠르게'} 누르는 편이에요 (${off > 0 ? '+' : ''}${off}ms)`;
  }
}

function renderSyncDots(): void {
  const dots = $('sync-dots');
  dots.replaceChildren(...Array.from({ length: 8 }, (_, i) => {
    const d = document.createElement('i');
    if (i < syncDeltas.length) d.className = 'on';
    return d;
  }));
}

function setSyncRange(v: number): void {
  const r = $<HTMLInputElement>('sync-range');
  r.value = String(v);
  $('sync-range-value').textContent = `${v > 0 ? '+' : ''}${v}ms`;
}

function closeSync(): void {
  click?.stop();
  click = null;
  settings.offsetMs = Number($<HTMLInputElement>('sync-range').value);
  saveSettings(settings);
  toTitle();
  $('open-sync').focus();
}

// ---------------------------------------------------------------- title & options

function renderTitle(): void {
  renderStages(STAGES, records, startStage);
  $<HTMLInputElement>('opt-guide').checked = settings.guide;
  $<HTMLInputElement>('opt-practice').checked = settings.practice;
  $('sync-value').textContent = `${settings.offsetMs > 0 ? '+' : ''}${settings.offsetMs}ms`;
  $('mute').textContent = settings.muted ? '소리 끔' : '소리 켬';
}

$<HTMLInputElement>('opt-guide').addEventListener('change', (e) => {
  settings.guide = (e.target as HTMLInputElement).checked;
  saveSettings(settings);
});
$<HTMLInputElement>('opt-practice').addEventListener('change', (e) => {
  settings.practice = (e.target as HTMLInputElement).checked;
  saveSettings(settings);
});
$('mute').addEventListener('click', () => {
  settings.muted = !settings.muted;
  engine.setMuted(settings.muted);
  saveSettings(settings);
  renderTitle();
});
$('open-sync').addEventListener('click', openSync);
$('sync-retry').addEventListener('click', startSyncRun);
$('sync-done').addEventListener('click', closeSync);
$<HTMLInputElement>('sync-range').addEventListener('input', (e) => setSyncRange(Number((e.target as HTMLInputElement).value)));
$('sync-pad').addEventListener('pointerdown', (e) => syncTap(e.timeStamp));
$('pause-btn').addEventListener('click', pause);
$('resume').addEventListener('click', resume);
$('restart').addEventListener('click', () => {
  void engine.resume();
  if (session) startStage(session.stage);
});
$('quit').addEventListener('click', toTitle);
$('again').addEventListener('click', () => session && startStage(session.stage));
$('next').addEventListener('click', () => {
  const i = session ? STAGES.indexOf(session.stage) : -1;
  if (i >= 0 && i < STAGES.length - 1) startStage(STAGES[i + 1]);
});
$('to-title').addEventListener('click', toTitle);

// ---------------------------------------------------------------- input

addEventListener('keydown', (e) => {
  if (mode === 'play') {
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) queue.push({ time: e.timeStamp, type: 'press' });
    } else if (e.code === 'Escape' || e.code === 'KeyP') pause();
    else if (e.code === 'KeyR' && session) startStage(session.stage);
  } else if (mode === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      resume();
    } else if (e.code === 'KeyR' && session) {
      void engine.resume();
      startStage(session.stage);
    }
  } else if (mode === 'result') {
    if (e.code === 'KeyR' && session) startStage(session.stage);
    else if (e.code === 'Escape') toTitle();
  } else if (mode === 'sync') {
    if (e.code === 'Escape') closeSync();
    else if (!e.repeat && (JUMP_KEYS.has(e.code) || e.code === 'Enter')) {
      e.preventDefault();
      syncTap(e.timeStamp);
    }
  }
});
addEventListener('keyup', (e) => {
  if (mode === 'play' && JUMP_KEYS.has(e.code)) queue.push({ time: e.timeStamp, type: 'release' });
});

const pointers = new Set<number>();
renderer.canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  e.preventDefault();
  pointers.add(e.pointerId);
  if (pointers.size === 1) queue.push({ time: e.timeStamp, type: 'press' });
});
const lift = (e: PointerEvent) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size === 0 && mode === 'play') queue.push({ time: e.timeStamp, type: 'release' });
};
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);
renderer.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// ---------------------------------------------------------------- loop

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (session && mode !== 'title' && mode !== 'sync') playFrame(now, mode === 'paused' ? 0 : dt);
  else demoFrame(now, dt);
  if (mode === 'sync') click?.pump();
  requestAnimationFrame(frame);
}

// Keep the music scheduled even when frames are slow.
setInterval(() => {
  if (session && mode === 'play') session.player.pump();
  if (mode === 'sync') click?.pump();
}, 25);

renderTitle();
resetDemo(performance.now());
show('title');
requestAnimationFrame(frame);
void document.fonts?.ready.then(() => renderer.resize());

/** For automated checks: `__beat.beat()` is the beat being heard, `__beat.session()` the current attempt. */
Object.assign(window, { __beat: { session: () => session, beat: () => (session ? heardBeat(session, performance.now()) : null) } });

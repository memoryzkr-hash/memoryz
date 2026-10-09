import './beat.css';
import { ClickTrack, SongPlayer, AudioEngine } from './audio/music';
import { START_BEAT } from './core/constants';
import {
  accuracy, advance, ballAt, heightOf, idealTaps, keyOf, newEcho, progress, rank, tap, xAt, type EchoSong, type EchoState, type Key,
} from './core/echo';
import { timingSummary, type Grade } from './core/judge';
import { DIFFICULTIES, difficultyOf, type Difficulty } from './core/charts';
import type { ComposedSong } from './core/compose';
import { chartOf, songOf, TRACKS, type TrackDef } from './core/levels';
import {
  loadRecords, loadSettings, mergeRecord, recordKey, saveRecords, saveSettings, syncOffset, type StageRecord,
} from './core/records';
import { Renderer, type EndCard } from './render/draw';
import { $, fillResult, nextTrack, renderDifficulties, renderTracks, show } from './ui/screens';

type Mode = 'title' | 'play' | 'paused' | 'result' | 'sync';

interface Session {
  stage: TrackDef;
  difficulty: Difficulty;
  composed: ComposedSong;
  song: EchoSong;
  state: EchoState;
  player: SongPlayer;
  attempt: number;
  practice: boolean;
  overAt: number | null;
  finishedAt: number | null;
  /** Beat of the last frame, for drawing while paused. */
  beat: number;
  /** Timing of the latest presses, for the HUD meter. */
  recent: number[];
  card: EndCard | null;
}

/** One-key songs: any of these. Two-key songs: the low and high sets. */
const LOW_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyD', 'KeyF', 'KeyZ']);
const HIGH_KEYS = new Set(['ArrowUp', 'KeyW', 'KeyJ', 'KeyK', 'KeyX']);
const ANY_KEYS = new Set(['Space', 'Enter', ...LOW_KEYS, ...HIGH_KEYS]);
const GRADE_TEXT: Record<Grade, string> = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const GRADE_COLOR: Record<Grade, string> = { perfect: '#ffffff', great: '#ffe14a', good: '#9fe8ff', miss: '#ff8a8a' };
/** Presses this long before the first beat are just warming up. */
const WARMUP_BEATS = 0.4;
const RESULT_AFTER_MS = 1200;
/** A press this long after the game ends starts again. */
const RETRY_AFTER_MS = 400;

const engine = new AudioEngine();
const renderer = new Renderer($('stage'));
let settings = loadSettings();
let records: Record<string, StageRecord> = loadRecords();
let mode: Mode = 'title';
let session: Session | null = null;
let lastFrame = performance.now();
const touchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;

engine.setMuted(settings.muted);

// ---------------------------------------------------------------- title demo

/** Track 1 echoed perfectly behind the title screen, on the page clock, silently. */
const demo = {
  stage: TRACKS[0],
  song: chartOf(TRACKS[0], 'normal'),
  state: newEcho(chartOf(TRACKS[0], 'normal')),
  taps: idealTaps(chartOf(TRACKS[0], 'normal')),
  next: 0,
  t0: 0,
};

function resetDemo(now: number): void {
  demo.state = newEcho(demo.song);
  demo.next = 0;
  demo.t0 = now;
  renderer.reset();
}

function demoFrame(now: number, dt: number): void {
  const beat = START_BEAT + ((now - demo.t0) / 1000) * (demo.stage.style.bpm / 60);
  const { state, song } = demo;
  while (demo.next < demo.taps.length && demo.taps[demo.next].beat <= beat) {
    const p = demo.taps[demo.next++];
    advance(state, song, p.beat);
    tap(state, song, p.beat, p.key, demo.stage.style.bpm);
  }
  advance(state, song, beat);
  for (const e of state.events) {
    if (e.type === 'bounce') {
      const n = song.notes[e.note];
      renderer.bounced(e.note, e.t, xAt(n.beat), heightOf(n.pitch), n.role === 'call' ? demo.stage.palette.staff : demo.stage.palette.accent);
    }
  }
  state.events.length = 0;
  renderer.render({
    stage: demo.stage, song, state, beat: Math.max(beat, START_BEAT), hint: true, hud: null, countIn: null, overFor: -1, card: null, touchKeys: false,
  }, dt);
  if (state.finished || beat > song.endBeat + 2) resetDemo(now);
}

// ---------------------------------------------------------------- sessions

function startStage(stage: TrackDef): void {
  engine.unlock();
  const difficulty = settings.difficulty;
  const composed = songOf(stage);
  const song = chartOf(stage, difficulty);
  session?.player.stop();
  session = {
    stage, difficulty, composed, song, state: newEcho(song, settings.practice), player: new SongPlayer(engine, composed), attempt: 0,
    practice: settings.practice, overAt: null, finishedAt: null, beat: START_BEAT, recent: [], card: null,
  };
  document.documentElement.style.setProperty('--accent', stage.palette.accent);
  beginAttempt();
}

/** From the top, after a one-bar count-in. */
function beginAttempt(): void {
  const s = session!;
  s.player.stop();
  s.player = new SongPlayer(engine, s.composed);
  s.attempt++;
  s.state = newEcho(s.song, s.practice);
  s.overAt = null;
  s.finishedAt = null;
  s.card = null;
  s.recent = [];
  renderer.reset();
  s.player.start(START_BEAT, 0);
  mode = 'play';
  show(null);
}

/** Song beat the player is hearing at page time `perfMs`, corrected by the sync setting. */
function heardBeat(s: Session, perfMs: number): number {
  return s.player.beatAt(engine.heardTimeAt(perfMs) - settings.offsetMs / 1000);
}

/** A press, handled the moment it happens so its note sounds without waiting for a frame. */
function onPress(time: number, key: Key): void {
  const s = session;
  if (!s || mode !== 'play') return;
  if (s.overAt !== null) {
    if (performance.now() - s.overAt > RETRY_AFTER_MS) beginAttempt();
    return;
  }
  if (s.finishedAt !== null) return;
  if (s.song.twoKeys && key === 'any') return;
  renderer.pressed(key);
  const b = heardBeat(s, time);
  if (b < -WARMUP_BEATS) return;
  const at = Math.max(b, s.state.t);
  advance(s.state, s.song, at);
  tap(s.state, s.song, at, key, s.stage.style.bpm);
  handleEvents(s, performance.now());
}

function playFrame(now: number, dt: number): void {
  const s = session!;
  s.player.pump();
  // The audio clock is suspended while paused; hold the picture still too.
  const beatNow = mode === 'paused' ? s.beat : heardBeat(s, now);
  if (mode === 'play' && s.overAt === null) {
    advance(s.state, s.song, Math.max(beatNow, s.state.t));
    handleEvents(s, now);
  }
  s.beat = beatNow;
  const st = s.state;
  renderer.render({
    stage: s.stage, song: s.song, state: st, beat: beatNow, hint: settings.guide,
    hud: {
      hearts: st.hearts, maxHearts: s.song.hearts, combo: st.combo, accuracy: accuracy(st), progress: progress(s.song, Math.max(0, beatNow)),
      best: s.practice ? 0 : s.card ? s.card.best : records[recordKey(s.stage.id, s.difficulty)]?.bestPct ?? 0, practice: s.practice,
      restored: st.restored, phrases: s.song.phrases, recent: s.recent,
    },
    countIn: beatNow < 0 ? beatNow : null, overFor: s.overAt === null ? -1 : (now - s.overAt) / 1000, card: s.card,
    touchKeys: s.song.twoKeys && touchDevice,
  }, dt);
  if (s.finishedAt !== null && now - s.finishedAt > RESULT_AFTER_MS && mode === 'play') showResult(s);
}

function handleEvents(s: Session, now: number): void {
  const p = s.stage.palette;
  const song = s.song;
  for (const e of s.state.events) {
    if (e.type === 'bounce') {
      const n = song.notes[e.note];
      renderer.bounced(e.note, e.t, xAt(n.beat), heightOf(n.pitch), e.role === 'call' ? p.staff : p.accent);
    } else if (e.type === 'tap') {
      const n = song.notes[e.note];
      const pitch = e.wrong ? (keyOf(n.pitch) === 'high' ? 1 : 4) : n.pitch;
      if (e.cracked) {
        s.player.crack();
        renderer.popup('BAD', `${e.deltaMs < 0 ? '너무 빨라!' : '너무 늦어!'}${s.practice ? '' : ' ♥−1'}`, GRADE_COLOR.miss, heightOf(pitch));
        continue;
      }
      s.player.playNote(e.wrong ? n.midi + (keyOf(n.pitch) === 'high' ? -7 : 7) : n.midi);
      if (e.wrong) renderer.popup('MISS', `다른 음${s.practice ? '' : ' ♥−1'}`, GRADE_COLOR.miss, heightOf(pitch));
      else {
        s.recent.push(e.deltaMs);
        if (s.recent.length > 12) s.recent.shift();
        renderer.popup(GRADE_TEXT[e.grade], e.grade === 'perfect' ? '' : e.deltaMs < 0 ? '빠름' : '느림', GRADE_COLOR[e.grade], heightOf(n.pitch));
      }
    } else if (e.type === 'stray') {
      s.player.knock();
      renderer.popup('헛박', '', '#d6d0e6', ballAt(s.state, song, e.t).y);
    } else if (e.type === 'fall') {
      engine.fall();
      try {
        navigator.vibrate?.(40);
      } catch {
        // Not allowed here; the sound is enough.
      }
      // A cracked or wrong note already said so when it was pressed.
      const head = s.state.heads[s.state.answer[e.note]];
      if (!s.practice && !head) renderer.popup('♥ −1', '놓쳤어요', '#ff8a8a', heightOf(song.notes[e.note].pitch));
    } else if (e.type === 'phrase' && e.perfect) {
      const y = ballAt(s.state, song, e.t).y;
      renderer.burst(xAt(e.t), y + 0.4, [p.accent, p.staff, '#ffe14a']);
      renderer.popup(e.healed ? '♥ +1' : 'ECHO!', '완벽한 메아리', p.accent, y);
    } else if (e.type === 'gameover') {
      s.overAt = now;
      s.player.stop(0.3);
      const pct = progress(song, e.t);
      const before = records[recordKey(s.stage.id, s.difficulty)]?.bestPct ?? 0;
      const merged = mergeRecord(records[recordKey(s.stage.id, s.difficulty)], { cleared: false, pct });
      records[recordKey(s.stage.id, s.difficulty)] = merged.record;
      saveRecords(records);
      s.card = { pct, best: Math.max(before, pct), newBest: merged.improved };
    } else if (e.type === 'finish') {
      s.finishedAt = now;
    }
  }
  s.state.events.length = 0;
}

function showResult(s: Session): void {
  mode = 'result';
  const st = s.state;
  const r = rank(st);
  const acc = accuracy(st);
  let improved = false;
  if (!s.practice) {
    const merged = mergeRecord(records[recordKey(s.stage.id, s.difficulty)], { cleared: true, rank: r, accuracy: acc });
    records[recordKey(s.stage.id, s.difficulty)] = merged.record;
    improved = merged.improved;
    saveRecords(records);
  }
  const idx = TRACKS.indexOf(s.stage);
  fillResult({
    stage: s.stage, rank: r, accuracy: acc, counts: st.counts, maxCombo: st.maxCombo, restored: st.restored,
    phrases: s.song.phrases, practice: s.practice, noHint: !settings.guide, improved, hasNext: idx < TRACKS.length - 1,
    difficulty: difficultyOf(s.difficulty).label,
    timing: timingSummary(st.judged),
  });
  engine.fanfare(s.stage.style.root);
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
  focusNextTrack();
}

function pause(): void {
  if (mode !== 'play' || !session || session.overAt !== null || session.finishedAt !== null) return;
  mode = 'paused';
  void engine.suspend();
  const pct = Math.floor(progress(session.song, Math.max(0, session.beat)) * 100);
  const hearts = session.practice ? '연습' : `하트 ${session.state.hearts}`;
  $('pause-info').textContent = `${session.stage.name} · ${difficultyOf(session.difficulty).label} · ${pct}% · ${hearts} · 구절 ${session.state.restored}/${session.song.phrases}`;
  show('pause');
  $('resume').focus();
}

function resume(): void {
  if (mode !== 'paused') return;
  void engine.resume();
  mode = 'play';
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

let trackButtons: HTMLButtonElement[] = [];

function renderTitle(): void {
  const d = settings.difficulty;
  trackButtons = renderTracks(
    TRACKS, TRACKS.map((t) => ({ beats: songOf(t).endBeat, notes: chartOf(t, d).notes.length / 2 })), records, d, startStage,
  );
  renderDifficulties(d, (next) => {
    settings.difficulty = next;
    saveSettings(settings);
    renderTitle();
    $(`diff-${next}`).focus();
  });
  $<HTMLInputElement>('opt-guide').checked = settings.guide;
  $<HTMLInputElement>('opt-practice').checked = settings.practice;
  $('sync-value').textContent = `${settings.offsetMs > 0 ? '+' : ''}${settings.offsetMs}ms`;
  $('mute').textContent = settings.muted ? '소리 끔' : '소리 켬';
  $('mute').setAttribute('aria-pressed', String(settings.muted));
}

function focusNextTrack(): void {
  trackButtons[nextTrack(TRACKS, records, settings.difficulty)]?.focus({ preventScroll: true });
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
  const i = session ? TRACKS.indexOf(session.stage) : -1;
  if (i >= 0 && i < TRACKS.length - 1) startStage(TRACKS[i + 1]);
});
$('to-title').addEventListener('click', toTitle);
$('res-sync').addEventListener('click', openSync);

// ---------------------------------------------------------------- input

function keyFor(code: string): Key | null {
  if (!session?.song.twoKeys) return ANY_KEYS.has(code) ? 'any' : null;
  if (LOW_KEYS.has(code)) return 'low';
  if (HIGH_KEYS.has(code)) return 'high';
  return ANY_KEYS.has(code) ? 'any' : null;
}

addEventListener('keydown', (e) => {
  if (mode === 'title' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !(document.activeElement instanceof HTMLInputElement)) {
    // ← → change the difficulty without leaving the tracklist.
    e.preventDefault();
    const i = DIFFICULTIES.findIndex((d) => d.id === settings.difficulty);
    const n = DIFFICULTIES.length;
    const focused = trackButtons.indexOf(document.activeElement as HTMLButtonElement);
    settings.difficulty = DIFFICULTIES[(i + (e.code === 'ArrowRight' ? 1 : n - 1)) % n].id;
    saveSettings(settings);
    renderTitle();
    trackButtons[focused >= 0 ? focused : nextTrack(TRACKS, records, settings.difficulty)]?.focus();
    return;
  }
  if (mode === 'title' && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
    e.preventDefault();
    const i = trackButtons.indexOf(document.activeElement as HTMLButtonElement);
    const n = trackButtons.length;
    const next = i < 0 ? nextTrack(TRACKS, records, settings.difficulty) : (i + (e.code === 'ArrowDown' ? 1 : n - 1)) % n;
    trackButtons[next].focus();
    return;
  }
  if (mode === 'play') {
    const key = keyFor(e.code);
    if (key) {
      e.preventDefault();
      if (!e.repeat) onPress(e.timeStamp, key);
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (session?.overAt !== null) toTitle();
      else pause();
    } else if (e.code === 'KeyR' && session) startStage(session.stage);
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
    else if (!e.repeat && (ANY_KEYS.has(e.code))) {
      e.preventDefault();
      syncTap(e.timeStamp);
    }
  }
});

renderer.canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  e.preventDefault();
  const key: Key = session?.song.twoKeys ? (e.clientX < innerWidth / 2 ? 'low' : 'high') : 'any';
  onPress(e.timeStamp, key);
});
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
focusNextTrack();
requestAnimationFrame(frame);
void document.fonts?.ready.then(() => renderer.resize());

/** For automated checks: `__beat.beat()` is the beat being heard, `__beat.session()` the current attempt. */
Object.assign(window, { __beat: { session: () => session, beat: () => (session ? heardBeat(session, performance.now()) : null) } });

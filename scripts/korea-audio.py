"""Synthesized trailer soundtrack for 대한민국, 지금 (src/korea). Cues come from src/korea/timeline.json.

Usage: python3 scripts/korea-audio.py out.wav
Only numpy is needed. Everything is deterministic (fixed seeds).
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
TL = json.loads((Path(__file__).resolve().parent.parent / "src/korea/timeline.json").read_text())
DUR = float(TL["duration"])
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def place(sig, start, gain=1.0, pan=0.0):
    """Mix a mono signal in at `start` seconds; pan -1 (left) .. 1 (right)."""
    i = int(start * SR)
    if i >= N:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), N - i)
    L[i : i + n] += sig[:n] * gain * np.sqrt((1 - pan) / 2) * np.sqrt(2)
    R[i : i + n] += sig[:n] * gain * np.sqrt((1 + pan) / 2) * np.sqrt(2)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def fft_filter(x, gain):
    """Static filter: gain(freqs) -> per-bin gain."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain(f), len(x))


def lowpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass_sweep(x, fc_of_t, q=1.2, frame=4096, hop=1024):
    """Time-varying band-pass via overlap-add STFT. fc_of_t: seconds -> Hz."""
    win = np.hanning(frame)
    out = np.zeros(len(x) + frame)
    norm = np.zeros(len(x) + frame)
    f = np.fft.rfftfreq(frame, 1 / SR)
    for s in range(0, len(x), hop):
        chunk = x[s : s + frame]
        if len(chunk) < frame:
            chunk = np.pad(chunk, (0, frame - len(chunk)))
        fc = fc_of_t((s + frame / 2) / SR)
        g = np.exp(-0.5 * (np.log2(np.maximum(f, 1) / fc) * q * 2) ** 2)
        y = np.fft.irfft(np.fft.rfft(chunk * win) * g, frame)
        out[s : s + frame] += y * win
        norm[s : s + frame] += win**2
    return (out / np.maximum(norm, 1e-3))[: len(x)]


def sweep_sine(f0, f1, dur, curve=1.0):
    t = tt(dur)
    k = (t / dur) ** curve
    f = f0 * (f1 / f0) ** k
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def saw(freq, dur, cutoff, detune=0.0):
    """Band-limited saw by additive synthesis; cutoff may be an array (Hz per sample)."""
    t = tt(dur)
    out = np.zeros(len(t))
    fc = np.broadcast_to(cutoff, t.shape)
    k = 1
    phase = rng.uniform(0, 6.28)
    while k * freq < min(SR / 2.2, np.max(fc) * 3):
        amp = (1 / k) * np.exp(-((k * freq / fc) ** 2))
        out += amp * np.sin(2 * np.pi * k * freq * (1 + detune) * t + phase * k)
        k += 1
    return out


# ---------------- elements ----------------
def heartbeat(t0, amp=1.0):
    for dt, a in ((0.0, 1.0), (0.17, 0.65)):
        d = 0.35
        s = sweep_sine(62, 38, d, 0.6) * np.exp(-tt(d) * 16)
        thump = lowpass(rng.standard_normal(len(s)), 120) * np.exp(-tt(d) * 40) * 0.6
        place(np.tanh((s + thump) * 2.2) * 0.55, t0 + dt, amp * a)


def tick(t0, amp=1.0):
    d = 0.05
    s = np.sin(2 * np.pi * 3100 * tt(d)) * np.exp(-tt(d) * 220)
    s += highpass(rng.standard_normal(len(s)), 4000) * np.exp(-tt(d) * 400) * 0.6
    place(s * 0.22, t0, amp, pan=0.35)


def impact(t0, amp=1.0):
    d = 3.0
    t = tt(d)
    boom = sweep_sine(95, 26, d, 0.35) * np.exp(-t * 1.6)
    body = lowpass(rng.standard_normal(len(t)), 260) * np.exp(-t * 7) * 1.4
    crack = bandpass_sweep(rng.standard_normal(int(0.4 * SR)), lambda s: 2500, q=0.8) * np.exp(-tt(0.4) * 22) * 0.9
    metal = sum(np.sin(2 * np.pi * f * t + i) * np.exp(-t * (3 + i)) for i, f in enumerate((187, 302, 471, 733, 1109))) * 0.08
    sig = np.tanh((boom * 1.2 + body + metal) * 1.6) * 0.8
    sig[: len(crack)] += crack
    place(sig, t0, amp)
    # Reverse swell into the hit.
    sw = 0.55
    swell = highpass(rng.standard_normal(int(sw * SR)), 600) * np.linspace(0, 1, int(sw * SR)) ** 3 * 0.25
    place(swell, t0 - sw, amp, pan=-0.2)
    place(swell, t0 - sw + 0.007, amp * 0.8, pan=0.2)


def braam(t0, amp=1.0, major=False):
    d = 3.6
    t = tt(d)
    notes = [55.0, 110.0, 138.59 if major else 130.81, 164.81, 220.0]
    # Filter blooms open over 0.25 s, then closes slowly.
    cutoff = 220 + 2200 * np.where(t < 0.25, t / 0.25, np.exp(-(t - 0.25) * 1.6))
    env = np.minimum(1, t / 0.05) * np.exp(-t * 0.9)
    sig = np.zeros(len(t))
    for i, f in enumerate(notes):
        for det in (-0.006, 0.006):
            sig += saw(f, d, cutoff, det) * (1.0 if i < 2 else 0.6)
    sig = np.tanh(sig * 0.5) * env
    place(sig * 0.6, t0, amp, pan=-0.25)
    place(sig * 0.6, t0 + 0.012, amp, pan=0.25)


def riser(t0, t1, amp=1.0):
    d = t1 - t0
    noise = rng.standard_normal(int(d * SR))
    n = bandpass_sweep(noise, lambda s: 250 * (7000 / 250) ** (s / d), q=1.0)
    k = tt(d) / d
    n *= k**2.2
    pitch = sweep_sine(180, 1400, d, 2.0) * k**2 * 0.25
    vib = 1 + 0.3 * np.sin(2 * np.pi * (4 + 10 * k) * tt(d))
    place((n * 0.9 + pitch * vib) * 0.7, t0, amp, pan=-0.1)
    place((n * 0.9) * 0.6, t0 + 0.01, amp, pan=0.3)


def piano(t0, freq, amp=1.0):
    d = 4.0
    t = tt(d)
    s = sum(np.sin(2 * np.pi * freq * k * t) * np.exp(-t * (1.2 + k * 0.9)) / k**1.3 for k in range(1, 8))
    s *= np.minimum(1, t / 0.004)
    place(s * 0.35, t0, amp)


# ---------------- arrangement ----------------
S = TL["scenes"]

# Cold open: sub drone + tinnitus whine + heartbeats.
cold = S["cold"]
d = cold[1] - cold[0] + 0.2
t = tt(d)
drone = (np.sin(2 * np.pi * 36.7 * t) + 0.5 * np.sin(2 * np.pi * 55.0 * t)) * np.minimum(1, t / 1.5) * 0.25
whine = np.sin(2 * np.pi * 2637 * t) * 0.012 * np.minimum(1, t / 3)
place(drone + whine, cold[0])

for b in TL["heartbeats"]:
    in_pop = S["pop"][0] <= b < S["pop"][1]
    heartbeat(b, 0.9 if b < 5 else 0.55 + 0.45 * (b - S["pop"][0]) / (S["pop"][1] - S["pop"][0]) if in_pop else 0.7)

riser(3.2, cold[1], 0.7)

# City: 128 bpm drive with kick, pumping bass and hats; power-down at the cut.
bpm = 128
beat = 60 / bpm
c0, c1 = S["city"][0], 14.98
roots = [55.0, 55.0, 43.65, 49.0]
for i in range(int((c1 - c0) / (beat / 2)) + 1):
    t0 = c0 + i * beat / 2
    if t0 >= c1:
        break
    bar = int(i // 8)
    root = roots[bar % 4]
    note_len = min(beat / 2, c1 - t0)
    k = (t0 - c0) / (c1 - c0)
    bass = saw(root, note_len, 300 + 900 * k) * np.exp(-tt(note_len) * 5)
    bass *= np.minimum(1, tt(note_len) / 0.08)  # side-chain pump
    place(np.tanh(bass * 1.4) * 0.32, t0, 1.0)
    if i % 2 == 0:
        kd = 0.35
        kick = sweep_sine(140, 44, kd, 0.4) * np.exp(-tt(kd) * 11)
        place(np.tanh(kick * 2) * 0.5, t0, 0.9)
    hd = 0.06
    hat = highpass(rng.standard_normal(int(hd * SR)), 7000) * np.exp(-tt(hd) * 70)
    place(hat * (0.08 + 0.1 * k) * (1.4 if i % 2 else 0.8), t0 + beat / 4, 1.0, pan=0.4)
riser(12.3, 14.75, 0.8)
pd = 0.45
f = 110 * (20 / 110) ** (tt(pd) / pd)
power_down = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR)
place(np.tanh(power_down * 2) * np.linspace(1, 0, len(f)) * 0.5, 14.62, 1.0)

# People: low cluster drone, an endless rising Shepard tone and the clock.
p0, p1 = S["pop"]
d = p1 - p0
t = tt(d)
k = t / d
low = (saw(36.7, d, 160) + saw(55.0, d, 140, 0.004)) * np.minimum(1, t / 2) * (0.25 + 0.35 * k)
place(np.tanh(low) * 0.5, p0)
shep = np.zeros(len(t))
base = 55 * 2 ** (k * 2.2)  # rises 2.2 octaves over the scene
phase = 2 * np.pi * np.cumsum(base) / SR
for o in range(6):
    fo = base * 2**o
    lf = np.log2(fo / 55)
    weight = np.exp(-0.5 * ((lf - 3.5) / 1.3) ** 2)
    shep += np.sin(phase * 2**o) * weight
place(shep * 0.06 * np.minimum(1, t / 2.5) * (0.4 + 0.9 * k), p0, pan=0.1)
for tk in TL["ticks"]:
    tick(tk)
riser(27.6, p1 - 0.05, 0.6)

# Climax: drums on 8ths that tighten to 16ths, a long riser, then a hard cut.
x0, x1 = S["climax"]
tcur = 30.3
while tcur < x1 - 0.02:
    k = (tcur - x0) / (x1 - x0)
    dd = 0.5
    tom = sweep_sine(110, 62, dd, 0.5) * np.exp(-tt(dd) * 9) + lowpass(rng.standard_normal(int(dd * SR)), 900) * np.exp(-tt(dd) * 30) * 0.4
    place(np.tanh(tom * 1.8) * 0.33 * (0.6 + 0.6 * k), tcur, pan=(0.3 if int(tcur * 10) % 2 else -0.3))
    step = 60 / 140 / 2 if tcur < 36.0 else 60 / 140 / 4
    tcur += step
riser(35.0, x1, 1.0)
d = x1 - x0
t = tt(d)
place(np.tanh(saw(36.7, d, 200) * 0.8) * 0.3 * np.minimum(1, t / 0.5), x0)

for hit in TL["impacts"]:
    impact(hit["t"], hit["amp"])
    if hit.get("braam"):
        braam(hit["t"], hit["amp"], hit.get("major", False))

# Finale: a lone piano, a shimmer burst, then the resolving chord.
piano(39.0, 440.0, 0.9)
piano(40.3, 659.25, 0.6)
piano(41.0, 554.37, 0.5)
riser(40.6, 41.6, 0.5)
sd = 2.5
shimmer = sum(np.sin(2 * np.pi * f * tt(sd) + i) for i, f in enumerate((1760, 2217, 2637, 3520))) * np.exp(-tt(sd) * 1.6) * 0.05
place(shimmer, 41.6)
f0 = 42.6
d = DUR - f0
t = tt(d)
pad = sum(saw(f, d, 900, det) for f in (110.0, 164.81, 220.0, 277.18, 329.63) for det in (-0.004, 0.004))
pad *= np.minimum(1, t / 0.8) * 0.08
place(np.tanh(pad), f0)

# ---------------- master ----------------
mix = np.stack([L, R])
# Room reverb: exponentially decaying noise IR, FFT convolution.
ir_len = int(2.2 * SR)
ir = rng.standard_normal((2, ir_len)) * np.exp(-np.arange(ir_len) / SR * 3.2)
ir = np.stack([lowpass(ir[0], 5000), lowpass(ir[1], 5000)])
size = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[c], size) * np.fft.rfft(ir[c], size), size)[:N] for c in range(2)])
wet /= np.abs(wet).max() / max(np.abs(mix).max(), 1e-9)
mix = mix + wet * 0.22

# Hard cuts to silence (power cut, pre-finale) — after the reverb so they are truly dead air.
time = np.arange(N) / SR
gate = np.ones(N)
for a, b in TL["cuts"]:
    gate[(time >= a) & (time < b)] = 0
    # 4 ms ramps to avoid clicks
    ra = (time >= a - 0.004) & (time < a)
    gate[ra] = np.minimum(gate[ra], (a - time[ra]) / 0.004)
mix *= gate
mix *= np.clip(time / 0.3, 0, 1) * np.clip((DUR - time) / 1.2, 0, 1)

mix = np.tanh(mix / np.abs(mix).max() * 1.6) / np.tanh(1.6)
mix *= 0.89
pcm = (mix.T * 32767).astype(np.int16)

out = sys.argv[1] if len(sys.argv) > 1 else "korea-audio.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)

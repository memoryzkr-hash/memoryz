"""Synthesized soundtrack for the 대한민국, 지금 motion piece (42 s, matches src/korea/main.ts cues).

Usage: python3 scripts/korea-audio.py out.wav
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 42.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)


def env(start, attack, hold, release):
    e = np.zeros(N)
    a0, a1 = int(start * SR), int((start + attack) * SR)
    h1 = int((start + attack + hold) * SR)
    r1 = min(N, int((start + attack + hold + release) * SR))
    e[a0:a1] = np.linspace(0, 1, a1 - a0)
    e[a1:h1] = 1
    e[h1:r1] = np.linspace(1, 0, r1 - h1)
    return e


def note(freq, detune=0.004):
    # Soft saw-ish pad: a few detuned partials.
    out = np.zeros(N)
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        for k, amp in ((1, 1.0), (2, 0.35), (3, 0.16), (4, 0.07)):
            out += amp * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
    return out / 5


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Chords per scene (MIDI): intro Am(add9), exports F maj7 → G, fertility Dm9, ageing Em7, outro A sus → A.
chords = [
    (0.0, 7.4, [45, 57, 60, 64, 71]),
    (7.0, 9.4, [41, 53, 57, 60, 64]),
    (16.0, 10.4, [38, 50, 53, 57, 64]),
    (26.0, 9.4, [40, 52, 55, 59, 62]),
    (35.0, 7.0, [45, 57, 62, 64, 69]),
]
left = np.zeros(N)
right = np.zeros(N)
for start, length, notes in chords:
    e = env(start, 1.4, length - 2.2, 2.0)
    for i, m in enumerate(notes):
        v = note(hz(m)) * e * (0.5 if i == 0 else 0.22)
        pan = 0.5 + (i - 2) * 0.12
        left += v * (1 - pan)
        right += v * pan

# Gentle low pulse in the data scenes.
pulse = np.zeros(N)
for beat in np.arange(7.5, 35.0, 0.5):
    i = int(beat * SR)
    L = int(0.35 * SR)
    seg = np.arange(L) / SR
    kick = np.sin(2 * np.pi * (55 + 60 * np.exp(-seg * 30)) * seg) * np.exp(-seg * 9)
    pulse[i : i + L] += kick[: max(0, min(L, N - i))] * 0.35
left += pulse
right += pulse

# Whooshes into each cut, shimmers on reveals.
noise = rng.standard_normal(N)
for c in (6.6, 15.6, 25.6, 34.6):
    e = env(c - 0.4, 0.8, 0.0, 0.6) ** 2
    w = noise * e * 0.18
    w = np.convolve(w, np.ones(24) / 24, mode="same")
    left += w
    right += np.roll(w, 300)

for cue, freq in ((4.4, 1760), (9.8, 1318.5), (11.0, 1568), (23.0, 1760), (30.2, 1318.5), (38.6, 1760)):
    i = int(cue * SR)
    L = int(1.6 * SR)
    seg = np.arange(L) / SR
    bell = (np.sin(2 * np.pi * freq * seg) + 0.4 * np.sin(2 * np.pi * freq * 2.01 * seg)) * np.exp(-seg * 3.2) * 0.12
    n = min(L, N - i)
    left[i : i + n] += bell[:n]
    right[i : i + n] += bell[:n] * 0.8

# Master fade and normalise.
master = np.clip(t / 1.5, 0, 1) * np.clip((DUR - t) / 2.0, 0, 1)
stereo = np.stack([left * master, right * master], axis=1)
stereo /= np.abs(stereo).max() / 0.8
pcm = (stereo * 32767).astype(np.int16)

out = sys.argv[1] if len(sys.argv) > 1 else "korea-audio.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)

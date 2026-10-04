"""영상에 맞춘 128BPM 비트와 효과음을 직접 합성해서 MP4에 붙인다(외부 음원 없음 → 저작권 걱정 없음).

    python3 promo/sound.py blinder   → promo/out/blinder_sound.mp4
    python3 promo/sound.py juljul    → promo/out/juljul_sound.mp4
    python3 promo/sound.py juljul --lead 2.7 --wav-only  → 앞에 2.7초 도입 장면이 붙는 판의 소리(wav)만

시각은 박(beat) 단위로 적는다. 15초 = 32박 = 8마디라서 끝과 처음이 그대로 이어진다.
영상 index.html 의 b(n) 시각과 같은 숫자를 쓴다.
"""
import math
import random
import struct
import subprocess
import sys
import wave
from array import array
from pathlib import Path

SR = 48000
DUR = 15.0
N = int(SR * DUR)
BEAT = 60 / 128
ROOT = Path(__file__).resolve().parent
LEAD = 0.0  # 앞에 붙는 도입 장면 길이(초). 0이면 15초 반복 재생용
random.seed(7)


def bt(n):
    return n * BEAT


def add(buf, start, samples, gain=1.0):
    i0 = int(round((start + LEAD) * SR))
    n = len(buf)
    for k, v in enumerate(samples):
        j = i0 + k
        if LEAD == 0:
            j %= n  # 끝을 넘으면 앞으로 감아서 반복 재생 때도 이어지게
        elif j < 0:
            continue
        elif j >= n:
            break
        buf[j] += v * gain


# ── 악기 ─────────────────────────────────────────────

def kick(vol=0.65):
    n = int(0.32 * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        f = 45 + 110 * math.exp(-t * 32)
        ph += 2 * math.pi * f / SR
        click = math.exp(-t * 900) * 0.4
        out.append(vol * (math.exp(-t * 9) * math.sin(ph) + click))
    return out


def clap(vol=0.24):
    n = int(0.25 * SR)
    out, prev = [], 0.0
    for k in range(n):
        t = k / SR
        w = random.uniform(-1, 1)
        hp = w - prev
        prev = w
        # 손뼉 세 번이 겹친 느낌
        e = sum(math.exp(-(t - d) * 40) for d in (0, 0.011, 0.022) if t >= d) / 2
        out.append(vol * e * (0.8 * hp + 0.3 * math.sin(2 * math.pi * 190 * t) * math.exp(-t * 30)))
    return out


def hat(vol=0.12, decay=55):
    n = int(0.09 * SR)
    out, prev = [], 0.0
    for k in range(n):
        w = random.uniform(-1, 1)
        out.append(vol * math.exp(-decay * k / SR) * (w - prev))
        prev = w
    return out


def bass(f, dur, vol=0.32):
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        env = min(1, t / 0.005) * math.exp(-t * 7)
        s = sum(math.sin(2 * math.pi * f * h * t) / h for h in (1, 2, 3, 4))
        out.append(vol * env * s * 0.6)
    return out


def pluck(freqs, vol=0.09, decay=7):
    n = int(0.5 * SR)
    out = []
    for k in range(n):
        t = k / SR
        env = min(1, t / 0.003) * math.exp(-t * decay)
        s = 0.0
        for f in freqs:
            s += math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t) * math.exp(-t * 14)
        out.append(vol * env * s)
    return out


def riser(dur, vol=0.18):
    n = int(dur * SR)
    out, lp = [], 0.0
    for k in range(n):
        x = k / n
        lp += (0.02 + 0.5 * x * x) * (random.uniform(-1, 1) - lp)
        out.append(vol * x * x * lp * 2)
    return out


def crash(vol=0.11, length=1.1):
    n = int(length * SR)
    out, prev = [], 0.0
    for k in range(n):
        w = random.uniform(-1, 1)
        out.append(vol * math.exp(-4 * k / SR) * (w - prev))
        prev = w
    return out


def impact(vol=0.7):
    """가림막이 '쾅' 닿는 소리"""
    n = int(0.22 * SR)
    out, ph, lp = [], 0.0, 0.0
    for k in range(n):
        t = k / SR
        f = 60 + 160 * math.exp(-t * 40)
        ph += 2 * math.pi * f / SR
        lp += 0.3 * (random.uniform(-1, 1) - lp)
        out.append(vol * (math.exp(-t * 18) * math.sin(ph) + 0.5 * math.exp(-t * 60) * lp))
    return out


def tick(vol=0.25, f=1900):
    n = int(0.03 * SR)
    return [vol * math.exp(-140 * k / SR) * math.sin(2 * math.pi * f * k / SR) for k in range(n)]


def tap(vol=0.35):
    n = int(0.06 * SR)
    out, lp = [], 0.0
    for k in range(n):
        lp += 0.12 * (random.uniform(-1, 1) - lp)
        out.append(vol * math.exp(-70 * k / SR) * (0.55 * math.sin(2 * math.pi * 320 * k / SR) + 0.9 * lp))
    return out


def pop(f=660, vol=0.22, up=True):
    n = int(0.14 * SR)
    out, ph = [], 0.0
    for k in range(n):
        x = k / n
        ff = f * (1 + (0.3 if up else -0.2) * min(1, x * 4))
        ph += 2 * math.pi * ff / SR
        out.append(vol * min(1, k / (0.004 * SR)) * math.exp(-22 * k / SR) * math.sin(ph))
    return out


def ding(f=880, vol=0.16, length=0.7):
    n = int(length * SR)
    return [vol * math.exp(-6 * k / SR) * min(1, k / (0.003 * SR))
            * (math.sin(2 * math.pi * f * k / SR) + 0.25 * math.sin(4 * math.pi * f * k / SR)) for k in range(n)]


def whoosh(dur=0.35, vol=0.14):
    n = int(dur * SR)
    out, lp = [], 0.0
    for k in range(n):
        x = k / n
        lp += (0.02 + 0.2 * math.sin(math.pi * x)) * (random.uniform(-1, 1) - lp)
        out.append(vol * (math.sin(math.pi * x) ** 2) * lp * 3)
    return out


def typing(vol=0.12):
    n = int(0.018 * SR)
    out, prev = [], 0.0
    for k in range(n):
        w = random.uniform(-1, 1)
        out.append(vol * math.exp(-260 * k / SR) * (w - prev))
        prev = w
    return out


# ── 비트 ─────────────────────────────────────────────

# 마디마다 화음: Am · F · C · G 두 번 (8마디 = 15초)
ROOTS = [110.0, 87.31, 130.81, 98.0]
CHORDS = [[440.0, 523.25, 659.25], [349.23, 440.0, 523.25], [392.0, 523.25, 659.25], [392.0, 493.88, 587.33]]


def music(drums, synth, transitions):
    first = -math.ceil(LEAD / BEAT) if LEAD else 0
    for n in range(first, 32):
        t = bt(n)
        bar = (n // 4) % 4
        add(drums, t, kick())
        if n % 2 == 1:
            add(drums, t, clap())
        add(drums, t + BEAT / 2, hat(0.09, 45))
        add(drums, t + BEAT / 4, hat(0.035))
        add(drums, t + 3 * BEAT / 4, hat(0.035))
        add(synth, t + BEAT / 2, bass(ROOTS[bar], BEAT / 2 * 0.95))
        if n % 4 in (1, 3):
            add(synth, t + BEAT * 0.75, pluck(CHORDS[bar]))
        if n % 4 == 2:
            add(synth, t + BEAT * 0.5, pluck(CHORDS[bar], 0.06))
    for m in transitions:
        add(drums, m - 0.6, riser(0.6))
        add(drums, m, crash())


def sidechain(buf):
    """킥마다 신스 소리를 잠깐 눌러서 '펌핑'"""
    first = -math.ceil(LEAD / BEAT) if LEAD else 0
    hits = [bt(n) + LEAD for n in range(first, 32) if bt(n) + LEAD >= 0]
    j = 0
    for k in range(len(buf)):
        t = k / SR
        while j + 1 < len(hits) and hits[j + 1] <= t:
            j += 1
        if not hits or t < hits[0]:
            d = t + DUR - hits[-1] if hits and LEAD == 0 else 1.0  # 첫 킥 전: 반복 재생이면 마지막 킥에서 이어서, 아니면 누르지 않음
        else:
            d = t - hits[j]
        buf[k] *= 1 - 0.65 * math.exp(-max(0.0, d) * 11)


# ── 영상별 효과음 (b(n) 과 같은 박 숫자) ──────────────────

def blinder(fx):
    for n in (0.5, 1, 1.5, 2, 2.5):            # 첫 장면 가림막 '쾅'
        add(fx, bt(n), impact(0.55))
    for n in (0.75, 1.75, 4.25, 4.75, 5.25):    # 큰 글자 올라옴
        add(fx, bt(n), whoosh(0.25, 0.08))
    add(fx, bt(7.6), whoosh(0.6, 0.16))         # 종이가 날아옴
    add(fx, bt(9), whoosh(0.8, 0.07))           # 스캔
    add(fx, bt(9.75), pop(740)); add(fx, bt(10.5), pop(880))
    for i in range(5):
        add(fx, bt(11) + i * bt(0.25), tick(0.2, 1600))
    for i in range(20):                         # 숫자 0 → 20
        add(fx, bt(11.75) + bt(1.5) * (1 - math.pow(1 - i / 20, 2.5)), tick(0.07, 2400))
    add(fx, bt(14), whoosh(0.7, 0.14))          # 폰이 날아옴
    for n in (16, 17, 18, 18.9):
        add(fx, bt(n), tap())
    add(fx, bt(16.1), pop(700)); add(fx, bt(17.1), pop(820)); add(fx, bt(18.1), pop(620, up=False))
    for i, f in enumerate((660, 784, 880, 1047, 1175)):
        add(fx, bt(19.25) + i * bt(0.125), pop(f, 0.14))
    for i in range(4):                          # 버튼이 튀어 오름
        add(fx, bt(22.75) + i * bt(0.25), pop(520 + i * 80, 0.12))
    add(fx, bt(23.5), tap()); add(fx, bt(25.5), tap())
    add(fx, bt(24.25), whoosh(0.4, 0.1)); add(fx, bt(25.7), whoosh(0.35, 0.1))
    add(fx, bt(27.25), pop(440, 0.18))
    for i in range(3):
        add(fx, bt(27.75) + i * bt(0.25), tick(0.18, 1500))
    add(fx, bt(28.75), impact(0.8))             # 로고 가림막
    for i in range(4):
        add(fx, bt(29.25) + i * bt(0.25), pop(600 + i * 120, 0.12))
    add(fx, bt(30.75), ding(1175, 0.14, 0.9))


def juljul(fx):
    add(fx, bt(0.75), whoosh(0.25, 0.08)); add(fx, bt(1.75), whoosh(0.25, 0.08))
    add(fx, bt(4.25), whoosh(0.25, 0.08))
    add(fx, bt(5) + 0.16, impact(0.8)); add(fx, bt(5.5) + 0.16, impact(0.8))  # 줄, 줄
    add(fx, bt(6.25), whoosh(0.25, 0.08))
    for i in range(5):
        add(fx, bt(7.5) + i * bt(0.125), whoosh(0.18, 0.06))
    for i in range(3):                          # 문단 카드
        add(fx, bt(9.75) + i * bt(0.375), whoosh(0.3, 0.09))
        add(fx, bt(11) + i * bt(0.5), pop(740 + i * 110, 0.14))
    for n in (14.75, 16.5, 18.25, 20, 21.75):   # 단계 숫자 굴러감
        add(fx, bt(n), whoosh(0.2, 0.1)); add(fx, bt(n) + 0.12, tick(0.2, 1300))
    for n in range(10):                         # 읽기: 낱말이 차례로
        add(fx, bt(13) + 0.06 * n, tick(0.06, 2200))
    add(fx, bt(14.75) + 0.08, impact(0.35)); add(fx, bt(14.75) + 0.22, impact(0.35))
    add(fx, bt(14.75) + 0.55, pop(880, 0.15))
    for i in range(6):
        add(fx, bt(16.5) + 0.08 + i * 0.05, tick(0.1, 1700))
    for d in (0.12, 0.32, 0.52):
        add(fx, bt(18.25) + d, tap()); add(fx, bt(18.25) + d + 0.05, pop(660 + d * 400, 0.11))
    add(fx, bt(20) + 0.15, typing()); add(fx, bt(20) + 0.3, typing())
    add(fx, bt(20) + 0.45, ding(1047, 0.12, 0.5))
    for k in range(12):
        add(fx, bt(21.75) + 0.05 + k * 0.045, typing(0.09))
    add(fx, bt(21.75) + 0.7, ding(1175, 0.13, 0.6))
    for k in range(5):                          # 날짜 위를 달림
        add(fx, bt(25) + k * bt(0.5), whoosh(0.25, 0.1)); add(fx, bt(25) + k * bt(0.5) + 0.12, pop(523 + k * 90, 0.12))
    add(fx, bt(28.25), pop(440, 0.18))
    for i in range(3):
        add(fx, bt(28.5) + i * bt(0.25), tick(0.18, 1500))
    add(fx, bt(29.25), pop(990, 0.16))
    add(fx, bt(29.75) + 0.12, impact(0.7)); add(fx, bt(30.25) + 0.12, impact(0.7))
    add(fx, bt(31.25), ding(1175, 0.14, 0.9))


TRANSITIONS = {
    "blinder": [bt(4), bt(14), bt(21), bt(27), 14.8],
    "juljul": [bt(4), bt(9), bt(13), bt(24), bt(28), 14.8],
}


def main():
    global LEAD
    args = sys.argv[1:]
    name = args[0] if args else ""
    if name not in ("blinder", "juljul"):
        sys.exit("사용법: python3 promo/sound.py <blinder|juljul> [--lead 초] [--wav-only]")
    if "--lead" in args:
        LEAD = float(args[args.index("--lead") + 1])
    wav_only = "--wav-only" in args
    total = N + int(LEAD * SR)
    drums, synth, fx = (array("d", [0.0]) * total for _ in range(3))
    music(drums, synth, TRANSITIONS[name])
    sidechain(synth)
    {"blinder": blinder, "juljul": juljul}[name](fx)
    if LEAD:
        add(fx, -0.35, whoosh(0.6, 0.16))  # 도입 장면 → 앱 화면으로 넘어갈 때

    mix = [0.6 * drums[k] + 1.0 * synth[k] + 0.9 * fx[k] for k in range(total)]
    peak = max(abs(v) for v in mix) or 1
    gain = 0.95 / peak
    out = ROOT / "out"
    wav = out / (f"{name}_lead.wav" if LEAD else f"{name}_sound.wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for v in mix:
            s = int(math.tanh(v * gain * 1.25) * 32000)
            frames += struct.pack("<hh", s, s)
        w.writeframes(bytes(frames))
    if wav_only:
        print(wav)
        return

    video = out / f"{name}.mp4"
    mp4 = out / f"{name}_sound.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(wav),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", str(mp4)], check=True)
    wav.unlink()
    print(mp4)


if __name__ == "__main__":
    main()

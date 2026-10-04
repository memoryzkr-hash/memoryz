"""영상에 맞춘 효과음을 직접 합성해서 MP4에 붙인다(외부 음원 없음 → 저작권 걱정 없음).

    python3 promo/sound.py blinder   → promo/out/blinder_sound.mp4
    python3 promo/sound.py juljul    → promo/out/juljul_sound.mp4

소리 시각은 각 영상 index.html 의 시간표와 맞춘다. 영상 시간표를 바꾸면 여기 EVENTS 도 같이 바꾼다.
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
ROOT = Path(__file__).resolve().parent
random.seed(7)


def add(buf, start, samples):
    i0 = int(start * SR)
    for k, v in enumerate(samples):
        j = (i0 + k) % N  # 끝을 넘으면 앞으로 감아서 반복 재생 때도 이어지게
        buf[j] += v


def env_decay(n, rate):
    return [math.exp(-rate * k / SR) for k in range(n)]


def tick(vol=0.25, f=1900):
    n = int(0.03 * SR)
    e = env_decay(n, 140)
    return [vol * e[k] * math.sin(2 * math.pi * f * k / SR) for k in range(n)]


def tap(vol=0.35):
    """손끝으로 누르는 둔한 소리"""
    n = int(0.06 * SR)
    out, lp = [], 0.0
    for k in range(n):
        lp += 0.12 * (random.uniform(-1, 1) - lp)
        body = math.sin(2 * math.pi * 320 * k / SR)
        out.append(vol * math.exp(-70 * k / SR) * (0.55 * body + 0.9 * lp))
    return out


def pop(f=660, vol=0.22, up=True):
    n = int(0.14 * SR)
    out, ph = [], 0.0
    for k in range(n):
        x = k / n
        ff = f * (1 + (0.25 if up else -0.2) * min(1, x * 4))
        ph += 2 * math.pi * ff / SR
        a = min(1, k / (0.004 * SR)) * math.exp(-22 * k / SR)
        out.append(vol * a * math.sin(ph))
    return out


def ding(f=880, vol=0.16, length=0.7):
    n = int(length * SR)
    return [vol * math.exp(-6 * k / SR) * min(1, k / (0.003 * SR))
            * (math.sin(2 * math.pi * f * k / SR) + 0.25 * math.sin(2 * math.pi * 2 * f * k / SR))
            for k in range(n)]


def whoosh(dur=0.35, vol=0.12):
    n = int(dur * SR)
    out, lp = [], 0.0
    for k in range(n):
        x = k / n
        cut = 0.02 + 0.18 * math.sin(math.pi * x)
        lp += cut * (random.uniform(-1, 1) - lp)
        out.append(vol * (math.sin(math.pi * x) ** 2) * lp * 3)
    return out


def glide(f0, f1, dur=0.4, vol=0.1):
    n = int(dur * SR)
    out, ph = [], 0.0
    for k in range(n):
        x = k / n
        ph += 2 * math.pi * (f0 + (f1 - f0) * x) / SR
        out.append(vol * math.sin(math.pi * x) * math.sin(ph))
    return out


def typing(vol=0.12):
    n = int(0.018 * SR)
    out, prev = [], 0.0
    for k in range(n):
        w = random.uniform(-1, 1)
        out.append(vol * math.exp(-260 * k / SR) * (w - prev))  # 고역만 남겨 '톡'
        prev = w
    return out


def pad(buf, vol=0.016):
    """아주 작게 깔리는 화음. 주파수를 1/15Hz 배수로 맞춰 15초 끝과 처음이 이어진다."""
    notes = [220.0, 277.18, 329.63, 415.30]
    notes = [round(f * DUR) / DUR for f in notes]
    lfo_f = 2 / DUR
    for k in range(N):
        t = k / SR
        s = sum(math.sin(2 * math.pi * f * t) for f in notes)
        buf[k] += vol * (0.75 + 0.25 * math.sin(2 * math.pi * lfo_f * t)) * s


def chime(buf, t):
    add(buf, t, ding(784, 0.14, 1.0))
    add(buf, t + 0.12, ding(1175, 0.12, 1.0))


def blinder(buf):
    for i in range(5):                       # 첫 장면 가림막
        add(buf, 0.12 + i * 0.13, tick(0.22, 1700 + i * 60))
    add(buf, 1.35, whoosh(0.45))             # PDF 등장
    add(buf, 2.3, pop(740)); add(buf, 2.65, pop(880))  # 그림 찾음
    for i in range(5):
        add(buf, 3.8 + i * 0.08, tick(0.12))
    for i in range(3):
        add(buf, 4.1 + i * 0.08, tick(0.12))
    add(buf, 4.9, whoosh(0.45))              # 폰 화면
    for at in (5.9, 6.8, 7.7, 8.5, 10.9, 12.1):
        add(buf, at, tap())
    add(buf, 5.95, pop(700)); add(buf, 6.85, pop(820))  # 열기
    add(buf, 7.75, pop(620, up=False))       # 닫기
    for i, f in enumerate((660, 784, 880, 1047, 1175)):  # 정답 확인 → 전부 열림
        add(buf, 8.75 + i * 0.04, pop(f, 0.12))
    add(buf, 9.9, whoosh(0.45))              # 복습 카드
    add(buf, 11.1, glide(500, 760)); add(buf, 12.3, glide(600, 960))
    add(buf, 12.9, whoosh(0.5))              # 마무리
    add(buf, 13.15, tick(0.25, 1500))
    chime(buf, 13.45)
    add(buf, 14.55, whoosh(0.5, 0.08))       # 처음으로


def juljul(buf):
    add(buf, 0.1, whoosh(0.5))               # 글이 문단으로 나뉨
    for i in range(3):
        add(buf, 0.3 + i * 0.17, tick(0.18, 1500 + i * 150))
    add(buf, 1.55, whoosh(0.5, 0.09))        # 문단 정리
    for i in range(3):
        add(buf, 2.8 + i * 0.25, pop(740 + i * 90, 0.15))
    add(buf, 4.9, whoosh(0.45))              # 단계 카드
    for at in (5.95, 6.95, 7.9, 9.1, 10.1):  # 단계 넘어감
        add(buf, at, tick(0.16, 1400))
    for at, f in ((6.25, 740), (6.5, 880)):  # 빈칸 열기
        add(buf, at, tap()); add(buf, at + 0.05, pop(f, 0.15))
    for i, at in enumerate((8.1, 8.38, 8.66)):  # 순서 고르기
        add(buf, at, tap()); add(buf, at + 0.08, pop(660 + i * 110, 0.12))
    add(buf, 9.35, typing()); add(buf, 9.55, typing())  # 쓰기
    add(buf, 9.7, ding(1047, 0.12, 0.5))
    for k in range(13):                      # 통째로 쓰기
        add(buf, 10.15 + k * 0.046, typing(0.09))
    add(buf, 10.8, ding(1175, 0.12, 0.5))
    add(buf, 10.95, whoosh(0.45))            # 복습
    for i, f in enumerate((523, 587, 659, 784, 880)):
        add(buf, 11.35 + i * 0.25, pop(f, 0.14))
    add(buf, 12.9, whoosh(0.5))              # 마무리
    for i in range(4):
        add(buf, 13.1 + i * 0.1, tick(0.16, 1500 + i * 100))
    chime(buf, 13.55)
    add(buf, 14.55, whoosh(0.5, 0.08))


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    if name not in ("blinder", "juljul"):
        sys.exit("사용법: python3 promo/sound.py <blinder|juljul>")
    buf = array("d", [0.0]) * N
    pad(buf)
    {"blinder": blinder, "juljul": juljul}[name](buf)

    peak = max(abs(v) for v in buf) or 1
    gain = 0.85 / peak
    out = ROOT / "out"
    wav = out / f"{name}_sound.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for v in buf:
            s = int(max(-1, min(1, math.tanh(v * gain * 1.1))) * 32000)
            frames += struct.pack("<hh", s, s)
        w.writeframes(bytes(frames))

    video = out / f"{name}.mp4"
    mp4 = out / f"{name}_sound.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(wav),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", str(mp4)], check=True)
    wav.unlink()
    print(mp4)


if __name__ == "__main__":
    main()

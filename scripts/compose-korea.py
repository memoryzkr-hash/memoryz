"""Final edit for 대한민국, 지금: live-action AI footage + 3D render + narration + score.

The 3D render (scripts/render-korea.mjs) is black wherever timeline.json has an `ai` slot, except for
text and glow elements. Footage is laid under it on a black track and the two are screen-blended,
so type and light sit on top of the footage while 3D shots pass through untouched.

Audio: synthesized score (scripts/korea-audio.py) ducked under the narration, plus each clip's own
ambience during its slot.

Usage:
  python3 scripts/compose-korea.py --render silent.mp4 --clips DIR --voice DIR --score score.wav \
      --out docs/korea/korea-2026.mp4 [--bitrate 8M]
Clip files are DIR/<clip>.mp4 and narration files DIR/<file>.wav, as named in timeline.json.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src/korea/timeline.json").read_text())
W, H, FPS = 1920, 1080, 30
BAR = round(H * 0.095)  # matches --bar: 9.5vh letterbox


def build(args):
    dur = TL["duration"]
    inputs = ["-i", args.render, "-i", args.score]
    vf, af = [], []
    n_in = 2

    # Footage track.
    vf.append(f"color=c=black:s={W}x{H}:r={FPS}:d={dur},format=yuv420p[bg0]")
    amb = []
    for i, slot in enumerate(TL["ai"]):
        length = slot["t1"] - slot["t0"]
        clip = Path(args.clips) / f"{slot['clip']}.mp4"
        inputs += ["-ss", f"{slot['src']:.3f}", "-t", f"{length + 0.1:.3f}", "-i", str(clip)]
        k = n_in
        n_in += 1
        vf.append(
            f"[{k}:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,"
            f"eq=contrast=1.08:saturation=0.88:brightness=-0.02,vignette=PI/4.2,"
            f"setpts=PTS-STARTPTS+{slot['t0']}/TB[c{i}]"
        )
        vf.append(f"[bg{i}][c{i}]overlay=eof_action=pass:enable='between(t,{slot['t0']},{slot['t1'] - 0.001})'[bg{i + 1}]")
        fade_out = max(0.0, length - 0.08)
        af.append(
            f"[{k}:a]atrim=0:{length:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.06,afade=t=out:st={fade_out:.3f}:d=0.08,"
            f"volume=0.8,adelay={int(slot['t0'] * 1000)}:all=1[amb{i}]"
        )
        amb.append(f"[amb{i}]")
    last = f"bg{len(TL['ai'])}"
    vf.append(f"[{last}]drawbox=x=0:y=0:w={W}:h={BAR}:color=black:t=fill,drawbox=x=0:y={H - BAR}:w={W}:h={BAR}:color=black:t=fill,format=gbrp[foot]")
    vf.append("[0:v]format=gbrp[r3d]")
    vf.append("[r3d][foot]blend=all_mode=screen,format=yuv420p[vout]")

    # Narration bus.
    vo = []
    for j, line in enumerate(TL["voice"]):
        inputs += ["-i", str(Path(args.voice) / f"{line['file']}.wav")]
        k = n_in
        n_in += 1
        af.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(line['t'] * 1000)}:all=1[v{j}]")
        vo.append(f"[v{j}]")
    af.append(
        f"{''.join(vo)}amix=inputs={len(vo)}:normalize=0:duration=longest,highpass=f=70,"
        "acompressor=threshold=0.12:ratio=3:attack=5:release=120:makeup=2,volume=1.25,asplit=2[vox][vosc]"
    )
    af.append(f"{''.join(amb)}amix=inputs={len(amb)}:normalize=0:duration=longest,volume=0.9[ambx]")
    af.append("[1:a]aresample=48000,volume=0.9[score]")
    af.append("[score][vosc]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=350:makeup=1[duck]")
    af.append(f"[duck][vox][ambx]amix=inputs=3:normalize=0:duration=first,atrim=0:{dur},alimiter=limit=0.95[aout]")

    graph = ";".join(vf + af)
    common = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-t", str(dur)]
    enc = ["-c:v", "libx264", "-preset", "slow", "-b:v", args.bitrate, "-maxrate", args.maxrate, "-bufsize", args.maxrate, "-pix_fmt", "yuv420p"]
    passlog = str(Path(args.out).with_suffix("")) + "-x264"
    subprocess.run(common + enc + ["-pass", "1", "-passlogfile", passlog, "-an", "-f", "null", "/dev/null"], check=True)
    subprocess.run(common + enc + ["-pass", "2", "-passlogfile", passlog, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", args.out], check=True)
    for f in Path(passlog).parent.glob(Path(passlog).name + "*"):
        f.unlink()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--render", required=True)
    p.add_argument("--clips", required=True)
    p.add_argument("--voice", required=True)
    p.add_argument("--score", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--bitrate", default="8M")
    p.add_argument("--maxrate", default="13M")
    build(p.parse_args())
    print("wrote", p.parse_args().out)

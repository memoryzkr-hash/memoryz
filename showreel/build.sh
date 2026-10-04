#!/usr/bin/env bash
# Renders showreel.mp4: 900 frames (4-sample motion blur) + synthesized soundtrack.
set -euo pipefail
cd "$(dirname "$0")"
TMP="${TMPDIR:-/tmp}/showreel-build"; rm -rf "$TMP"; mkdir -p "$TMP"
node render.cjs "$TMP/frames" 0 900 "${WORKERS:-4}" 4 1
node audio.cjs "$TMP/audio.wav"
ffmpeg -loglevel error -y -framerate 60 -i "$TMP/frames/f%04d.png" -i "$TMP/audio.wav" \
  -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -movflags +faststart -shortest showreel.mp4
echo "wrote $(pwd)/showreel.mp4"

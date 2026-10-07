#!/usr/bin/env bash
# Downloads the Higgsfield-generated footage and narration listed in docs/korea/assets.json.
# Usage: scripts/fetch-korea-assets.sh OUT_DIR   →  OUT_DIR/clips/*.mp4, OUT_DIR/voice/*.wav
set -euo pipefail
out=${1:?output dir}
mkdir -p "$out/clips" "$out/voice"
manifest="$(dirname "$0")/../docs/korea/assets.json"
python3 - "$manifest" <<'PY' | while read -r kind name url; do curl -fsS -o "$out/$kind/$name" "$url"; echo "$kind/$name"; done
import json, sys
m = json.load(open(sys.argv[1]))
for k, v in m["clips"]["items"].items():
    print("clips", k + ".mp4", v["url"])
for k, url in m["voice"]["items"].items():
    print("voice", k + ".wav", url)
PY

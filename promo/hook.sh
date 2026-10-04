#!/usr/bin/env bash
# 힉스필드로 만든 실사 도입 장면(3초)을 앱 소개 영상 앞에 붙인다.
#   bash promo/hook.sh blinder promo/hooks/blinder_hook.mp4 1.0
#   → promo/out/blinder_higgsfield.mp4 (약 17.7초, 효과음 포함)
#   세 번째 값은 도입 장면에서 쓸 구간의 시작 초(없으면 0)
set -euo pipefail

NAME="$1"
HOOK="$2"
START="${3:-0}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/out"
FONT_B="$DIR/shared/fonts/pretendard_bold.otf"
FONT_S="$DIR/shared/fonts/pretendard_semibold.otf"
HOOK_LEN=3.0
XFADE=0.3
LEAD=$(python3 -c "print($HOOK_LEN - $XFADE)")

case "$NAME" in
  blinder) KICKER="전공 그림 암기"; TITLE=$'교재 그림, 아직도\n오려 붙여 외우세요?' ;;
  juljul)  KICKER="지문 · 발표문 · 모범 답안"; TITLE=$'긴 글, 아직도\n통째로 외우세요?' ;;
  *) echo "사용법: bash promo/hook.sh <blinder|juljul> <도입 장면.mp4> [시작 초]"; exit 1 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf '%s' "$KICKER" > "$TMP/kicker.txt"
printf '%s' "$TITLE" > "$TMP/title.txt"

python3 "$DIR/sound.py" "$NAME" --lead "$LEAD" --wav-only > /dev/null

# 글자는 0.3초부터 0.25초 동안 나타남. 사진 위 글자는 반투명 검정 위에 흰 글자(디자인 규칙)
ALPHA="if(lt(t,0.3),0,if(lt(t,0.55),(t-0.3)/0.25,1))"
ffmpeg -y -loglevel error \
  -i "$HOOK" -i "$OUT/$NAME.mp4" -i "$OUT/${NAME}_lead.wav" \
  -filter_complex "
    [0:v]trim=start=$START:duration=$HOOK_LEN,setpts=PTS-STARTPTS,fps=60,
         scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,
         drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill,
         drawtext=fontfile=$FONT_S:textfile=$TMP/kicker.txt:fontsize=44:fontcolor=white:x=88:y=250:alpha='$ALPHA',
         drawtext=fontfile=$FONT_B:textfile=$TMP/title.txt:fontsize=100:line_spacing=18:fontcolor=white:x=88:y=322:alpha='$ALPHA',
         format=yuv420p[h];
    [1:v]fps=60,format=yuv420p,setsar=1[a];
    [h][a]xfade=transition=fade:duration=$XFADE:offset=$LEAD[v]" \
  -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -shortest -movflags +faststart \
  "$OUT/${NAME}_higgsfield.mp4"

rm -f "$OUT/${NAME}_lead.wav"
echo "$OUT/${NAME}_higgsfield.mp4"

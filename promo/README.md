# 소개 영상 (블라인더 · 줄줄)

15초 세로 영상(1080×1920, 60fps) 2편이에요. 소리 없는 판과 효과음을 넣은 판(`_sound.mp4`)이 있어요. 끝 장면이 첫 장면으로 이어져서 반복 재생돼요.

| 파일 | 내용 |
|---|---|
| `out/blinder.mp4` | 블라인더: 그림 이름표 가리기 → PDF에서 그림 찾기 → 눌러서 열기 → 복습 날짜 → 마무리 |
| `out/juljul.mp4` | 줄줄: 긴 글 → 문단별 정리 → 6단계 외우기 → 1·3·7·14·30일 복습 → 마무리 |
| `blinder/index.html`, `juljul/index.html` | 영상 원본. 브라우저로 열면 반복 재생돼요 (`npx serve promo` 같은 간단한 서버로 열기) |
| `shared/` | 공통 색·글꼴(프리텐다드)·재생기·예시 그림 |
| `render.cjs` | 원본을 MP4로 바꾸는 도구 |
| `out/blinder_higgsfield.mp4`, `out/juljul_higgsfield.mp4` | 힉스필드로 만든 3초 실사 도입 장면 + 앱 영상 + 효과음 (17.7초) |
| `out/*_reels.mp4`, `out/*_higgsfield_reels.mp4` | **릴스 올릴 때 추천.** 음악 없이 효과음만 작게 넣은 판. 인스타 릴스에서 음악을 골라 위에 얹어요 |
| `hooks/` | 힉스필드 원본 장면 (Seedance 2.5, 5초, 1080p). 1~4초 구간을 써요 |
| `hook.sh` | 도입 장면을 앱 영상 앞에 붙이는 도구 |
| `sound.py` | 128BPM 비트(Am–F–C–G)와 효과음을 직접 합성해 `_sound.mp4`를 만드는 도구. 외부 음원을 쓰지 않아 저작권 걱정이 없어요 |

128BPM 박자(15초 = 32박)에 맞춘 모션그래픽이에요. 블라인더는 블라인드 막대 전환과 가림막 '쾅', 줄줄은 글줄 막대 전환과 떨어지는 '줄줄' 글자가 중심이에요. 색은 앱과 같은 남색 #3D33D8 · 검정 · 흰색, 글꼴은 프리텐다드예요.
가격·결제와 아직 켜지지 않은 AI 기능은 영상에 넣지 않았어요.

## 다시 만들기

```bash
NODE_PATH=$(npm root -g) node promo/render.cjs blinder              # → promo/out/blinder.mp4
NODE_PATH=$(npm root -g) node promo/render.cjs juljul --shots 0,7.5  # 확인용 PNG만 찍기
python3 promo/sound.py blinder                                       # → promo/out/blinder_sound.mp4
python3 promo/sound.py blinder --fx-only                             # → promo/out/blinder_reels.mp4 (효과음만)
bash promo/hook.sh blinder promo/hooks/blinder_hook.mp4 1.0          # → promo/out/blinder_higgsfield.mp4
bash promo/hook.sh blinder promo/hooks/blinder_hook.mp4 1.0 reels    # → promo/out/blinder_higgsfield_reels.mp4
```

필요한 것: playwright(크로미움), ffmpeg, python3

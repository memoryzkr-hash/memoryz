# 소개 영상 (블라인더 · 줄줄)

15초 세로 영상(1080×1920, 60fps, 소리 없음) 2편이에요. 끝 장면이 첫 장면으로 이어져서 반복 재생돼요.

| 파일 | 내용 |
|---|---|
| `out/blinder.mp4` | 블라인더: 그림 이름표 가리기 → PDF에서 그림 찾기 → 눌러서 열기 → 복습 날짜 → 마무리 |
| `out/juljul.mp4` | 줄줄: 긴 글 → 문단별 정리 → 6단계 외우기 → 1·3·7·14·30일 복습 → 마무리 |
| `blinder/index.html`, `juljul/index.html` | 영상 원본. 브라우저로 열면 반복 재생돼요 (`npx serve promo` 같은 간단한 서버로 열기) |
| `shared/` | 공통 색·글꼴(프리텐다드)·재생기·예시 그림 |
| `render.cjs` | 원본을 MP4로 바꾸는 도구 |

디자인은 두 앱 규칙을 따랐어요. 바탕 #F7F7F8, 남색 #3D33D8 한 가지, 검은 알약 버튼, 검은 가림막, 프리텐다드 글꼴을 쓰고, 튀어오르기나 회전 없이 페이드만 써요.
가격·결제와 아직 켜지지 않은 AI 기능은 영상에 넣지 않았어요.

## 다시 만들기

```bash
NODE_PATH=$(npm root -g) node promo/render.cjs blinder              # → promo/out/blinder.mp4
NODE_PATH=$(npm root -g) node promo/render.cjs juljul --shots 0,7.5  # 확인용 PNG만 찍기
```

필요한 것: playwright(크로미움), ffmpeg

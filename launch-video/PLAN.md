# 프로덕트 런칭 모션그래픽 영상 제작 계획

> 진행 현황: **Phase 1–7 완료.** `npm run render`(1080p) / `npm run render:4k`. 남은 선택 작업: 세로(9:16) 버전.
> `[대괄호]` 값은 현재 기본값(Tally) 그대로 사용 중. 바꾸려면 `src/theme.ts`와 각 씬을 수정.

---

## 0. 목표

코드만으로 약 35초짜리 SaaS/앱 런칭 모션그래픽 영상을 만든다.
레퍼런스 스타일: "문제(혼돈) → 제품 등장(정리) → 핵심 숫자 → 일상 속 사용 장면 → 슬로건 → 로고" 구조의
키네틱 타이포그래피 영상. 다크 화면(문제)에서 밝은 화면(해결)로 전환되는 대비가 핵심이다.

- 제품명: `[Tally]`
- 한 줄 설명: `[흩어진 수입/지출을 한 곳에서 보여주는 앱]`
- 타깃이 겪는 문제: `[돈 정보가 14개 탭에 흩어져 있어서 오늘 돈을 벌었는지 모른다]`
- 핵심 숫자 스토리: `[총수입 $1,284 → 수수료/구독 차감 → 실제로 남은 돈 $412.00]`
- 슬로건: `[Fewer tabs.]`
- 포인트 컬러: `[#F26B1D 오렌지]` / 다크 배경 `[#14121C]` / 라이트 배경 `[#F7F5F0]`

## 1. 기술 스택

- **Remotion** (React 기반 영상 렌더링).
- TypeScript, 1920×1080, 30fps, 총 1050프레임(35초).
- 폰트: 헤드라인은 Inter Tight(800), 강조 단어는 Instrument Serif Italic.
  샌드박스 Chromium이 프록시 인증서를 신뢰하지 않아 `@remotion/google-fonts` 대신
  같은 Google Fonts 파일을 `public/fonts`에 두고 `@remotion/fonts`로 로드한다(오프라인 렌더 가능).
- 애니메이션은 전부 `spring()`과 `interpolate()`로 처리하고, CSS transition은 쓰지 않는다.
- 숫자 카운트업, 타이핑 효과, 파티클은 모두 프레임 기반으로 직접 구현.

## 2. 씬 구성 (타임라인)

| # | 시간 | 프레임 | 배경 | 내용 | 모션 포인트 |
|---|------|--------|------|------|-------------|
| 1 | 0–3s | 0–89 | 다크 | 잠금화면 스타일 시계 `11:46 PM`, 위에 작은 날짜 | 숫자가 롤링되며 1분 넘어감, 살짝 줌인 |
| 2 | 3–5.5s | 90–164 | 다크 | 작은 브라우저 탭 카드들이 사방에서 날아와 쌓임, 숫자 카운터 `10 → 14 TABS.` | 카드에 서비스명/아이콘, 카운터는 오렌지 |
| 3 | 5.5–8s | 165–239 | 다크 | 검색창에 `did i make money today` 타이핑 | 커서 깜빡임, 글자당 2~3프레임 |
| 4 | 8–10.5s | 240–314 | 다크 | 대시보드 카드(`$1,284.00`, `$847.12`)가 좌우로 등장하며 `over here.` / `over there.` | here/there는 오렌지 이탤릭 세리프, 모션 블러 |
| 5 | 10.5–13s | 315–389 | 다크 | 수십 개 금액 카드가 소용돌이처럼 퍼지고 중앙에 `everywhere.` | 3D 회전(perspective) + 카메라 틸트 |
| 6 | 13–14.5s | 390–434 | 라이트 플래시 | 화이트 플래시 후 로고 `||||/ Tally` 등장 | 하드컷 전환이 핵심 |
| 7 | 14.5–17s | 435–509 | 라이트 | 서비스 라벨(작은 컬러 점 + 이름)에서 파티클이 중앙으로 빨려들어감 | 파티클 50~100개, 이징 in-out |
| 8 | 17–19s | 510–569 | 라이트 | `$1,280 → $1,284` 카운트업, 위에 작은 회색 라벨 | 숫자 자리별 롤링 |
| 9 | 19–23s | 570–689 | 라이트 | 차감 항목(작은 오렌지 텍스트)이 하나씩 붙으며 `$1,284 → $626 → $412.00`, 라벨 `What you actually kept` | `.00`은 작게, `actually`는 오렌지 이탤릭 |
| 10 | 23–25s | 690–749 | 라이트 | `$412.00`이 모션블러로 사라지고, 카드 `Your subs are bleeding money` + 오렌지 막대 3개 | 막대가 아래에서 올라옴 |
| 11 | 25–29s | 750–869 | 라이트(크림) | 아이폰 목업 등장, 잠금화면 `7:02` + 알림, 좌우에 `Every morning.` / `before coffee.` | 폰 아래 오렌지 글로우, 알림 슬라이드인 |
| 12 | 29–32s | 870–959 | 라이트 | `Fewer tabs.` — 'tabs'가 탭 카드처럼 접히며 들어와 자리 잡음 | 글자 단위 stagger |
| 13 | 32–35s | 960–1049 | 라이트 | 로고 `||||/ Tally` 마무리 → 페이드아웃 | 로고 마크가 한 획씩 그려짐 |

씬 길이의 단일 출처는 `src/timeline.ts`.

## 3. 폴더 구조

```
src/
  index.ts              # registerRoot
  Root.tsx              # Composition 등록 (1920x1080, 30fps)
  Video.tsx             # <Series>로 씬 배치
  timeline.ts           # 씬 순서/길이 (위 표와 동일)
  config.ts             # 해상도/fps, spring 프리셋 (Node에서도 import 가능)
  cues.ts               # 씬별 이벤트 타이밍 — 화면과 사운드트랙이 공유
  theme.ts              # 컬러, 폰트
  anim.ts               # enter()/ramp() 애니메이션 헬퍼
  data.ts               # 서비스 목록, 씬 2의 탭 14개
  Audio.tsx             # 음악(music.mp3 또는 생성된 bed) + 효과음 재생
  Gallery.tsx           # 개발용: 공통 컴포넌트 한 장 확인 (Dev/Gallery)
  components/
    CountUp.tsx         # 숫자 카운트업 (자리별 롤링)
    TypeWriter.tsx      # 타이핑 + 커서
    TabCard.tsx         # 브라우저 탭/금액 카드
    Logo.tsx            # 로고 마크(획 애니메이션) + 워드마크
    PhoneMockup.tsx     # 아이폰 목업 (CSS로 직접 그림)
    Particles.tsx       # 결정론적 파티클 (random(seed) 사용)
    AccentWord.tsx      # 오렌지 이탤릭 세리프 강조 단어
    DirectionalBlur.tsx # 축 방향 모션 블러 (SVG filter)
  scenes/
    S01_Clock.tsx ... S13_Outro.tsx
    shared.tsx          # 씬 8~10이 공유하는 숫자 레이아웃
public/
  fonts/                # Inter Tight, Instrument Serif (OFL)
  audio/                # npm run sound가 생성 (music.wav, sfx.wav), git 제외
  music.mp3             # (선택) 직접 준비한 음악 — 있으면 생성 음악 대신 사용
scripts/
  soundtrack.ts         # 사운드트랙 합성기
```

## 4. 작업 단계 (Phase별로 진행하고 각 단계 끝에 확인받기)

- [x] **Phase 1 — 셋업**: 프로젝트 생성, `theme.ts`에 컬러/폰트/spring 프리셋, 빈 13개 씬을 `<Series>`로 연결해 타임라인 확인.
- [x] **Phase 2 — 공통 컴포넌트**: CountUp, TypeWriter, TabCard, Logo, PhoneMockup, Particles, AccentWord를 만들고 각각 `remotion still`로 확인.
- [x] **Phase 3 — 다크 파트 (씬 1~5)**: 화면이 점점 복잡하고 정신없어지는 느낌.
- [x] **Phase 4 — 라이트 파트 (씬 6~10)**: 화이트 플래시 전환 후 여백 많고 차분한 톤. 숫자가 주인공.
- [x] **Phase 5 — 마무리 (씬 11~13)**: 일상 장면과 슬로건, 로고.
- [x] **Phase 6 — 오디오 & 폴리싱**: 사운드트랙을 코드로 합성한다(`scripts/soundtrack.ts`, `npm run sound`).
  `src/cues.ts`의 이벤트 타이밍을 화면과 공유하므로 효과음이 프레임 단위로 맞는다. 120 BPM이라 모든 씬 컷이 박자 위에 떨어진다.
  `public/music.mp3`를 넣으면 생성된 음악 대신 그 파일을 쓰고, 효과음은 그대로 유지된다.
  모션블러: 씬 5 소용돌이는 `<CameraMotionBlur>`(6 samples), 직선 이동(씬 4 휩팬, 씬 10 퇴장)은 SVG 방향성 블러(`DirectionalBlur`), 날아오는 탭/롤링 숫자는 속도 비례 blur.
- [x] **Phase 7 — 렌더**: `npm run render` → `out/video.mp4`, `npm run render:4k` → `out/video-4k.mp4`. PNG 프레임 + BT.709 + CRF 12(x264 slow) + AAC 320k (`remotion.config.ts`). 세로 버전은 미착수.

## 5. 품질 기준 (각 Phase마다 스스로 체크)

- 각 씬의 중간 프레임을 `remotion still`로 뽑아서 확인하고, 글자 잘림·겹침·정렬 문제를 고친 뒤 다음으로 넘어갈 것.
- `Math.random()` 금지. 반드시 Remotion의 `random('seed')` 사용.
- 모든 등장 모션은 spring 기반, damping 12~20 범위 (`springs` 프리셋 사용).
- 한 화면에 메시지는 하나만. 텍스트가 많아지면 씬을 쪼갤 것.
- 다크 파트는 빠른 컷(1~2.5초), 라이트 파트는 조금 느리게(2~4초).

## 6. 구현 메모

- 씬 9 차감 항목: `− $96.30 payment fees`, `− $561.70 tax set aside` → $626, `− $214.00 subscriptions` → $412.00.
  씬 10 막대의 구독료($55 + $119 + $40)도 합계 $214로 맞췄다.
- 씬 8 → 9 → 10의 큰 숫자는 `scenes/shared.tsx`의 같은 위치/크기를 써서 하드컷에서도 튀지 않는다.
- 숫자 롤링: `CountUp`(오도미터, 씬 8), `NumberMorph`(자리별로 이전 숫자 → 새 숫자, 씬 9), `DigitColumn`(시계/탭 카운터).

## 7. 내레이션 (한국어, 여성)

Higgsfield Seed Audio, 프리셋 보이스 **Sloane**(낮은 톤, 중앙값 약 160Hz). 원본 파일은 `assets/vo/sloane-ko/NN.wav`이고,
대사와 타이밍은 `src/cues.ts`의 `VOICEOVER`에 있다. 내레이션이 나오는 동안 음악은 −7.5dB, 효과음은 −3dB로 낮아진다.

| # | 시작 | 대사 | 화면 |
|---|------|------|------|
| 01 | 0.50s | 자정이 다 됐어요. | 시계 |
| 02 | 3.80s | 열네 개의 탭. | 14 TABS. |
| 03 | 5.73s | 오늘, 돈을 벌긴 한 걸까? | 검색어 타이핑 |
| 04 | 7.93s | 여기에도 있고, | over here. (컷 직전 J-cut) |
| 05 | 9.87s | 저기에도 있고, | over there. |
| 06 | 10.97s | 어디에나 흩어져 있죠. | everywhere. |
| 07 | 13.30s | 탤리를 소개합니다. | 로고 |
| 08 | 14.77s | 모든 수입을, 한 곳에. | 파티클 |
| 09 | 17.27s | 오늘 번 돈. | $1,284 |
| 10 | 20.60s | 그리고 실제로 남은 돈. | What you actually kept |
| 11 | 23.07s | 잊고 있던 구독료까지. | 구독 카드 |
| 12 | 25.73s | 매일 아침, | Every morning. |
| 13 | 26.80s | 커피보다 먼저. | before coffee. |
| 14 | 29.60s | 탭은, 더 적게. | Fewer tabs. |
| 15 | 33.00s | 탤리. | 로고 |

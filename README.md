# Memoryz Royale

클래시로얄 스타일의 실시간 카드 배틀 웹 게임 (TypeScript + Three.js 3D 전장 + Phaser 3 UI).

![배틀 화면](docs/screenshot.png)

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 게임 로직 단위 테스트
npm run build    # dist/ 에 정적 빌드 (GitHub Pages 등에 그대로 배포 가능)
```

## 플레이 방법

- 메뉴의 **덱 편집**에서 15장 중 8장으로 덱을 짭니다 (브라우저에 저장됨).
- 메뉴에서 AI 난이도(쉬움/보통/어려움)를 고릅니다. AI는 준비된 덱 3개 중 하나를 씁니다.
- 아래 카드를 **끌어서** 전장에 놓거나, 카드를 **탭한 뒤 전장을 탭**해서 배치합니다.
- 빨갛게 칠해진 곳에는 유닛을 놓을 수 없습니다 (주문은 어디든 가능).
  상대 프린세스 타워를 부수면 그 라인의 강 건너편까지 배치할 수 있습니다.
- 3분 경기, 마지막 1분은 엘릭서 2배. 동점이면 1분 연장전(먼저 크라운을 따면 승리).
- 킹타워를 부수면 즉시 3크라운 승리.

## 카드 (`src/data/cards.json`)

| 카드 | 비용 | 특징 |
| --- | --- | --- |
| ⚔️ 기사 | 3 | 튼튼한 근접 유닛 |
| 🏹 궁수 | 3 | 원거리 2명, 공중 공격 가능 |
| 🗿 자이언트 | 5 | 건물만 공격하는 탱커 |
| 👺 고블린 | 2 | 빠른 근접 3마리 |
| 🐉 아기 드래곤 | 4 | 공중 유닛, 범위 공격 |
| 💀 해골 군대 | 3 | 약한 해골 12마리 |
| 🔥 파이어볼 | 4 | 범위 주문 (타워에는 35% 피해) |
| 💣 대포 | 3 | 지상 방어 건물, 30초 후 소멸 |
| 🔫 머스킷병 | 4 | 긴 사거리, 공중 공격 가능 |
| 🤖 미니 페카 | 4 | 한 방이 매우 센 근접 유닛 |
| 🐗 호그 라이더 | 4 | 빠름, 건물만 공격, 강을 뛰어넘음 |
| 🪓 발키리 | 4 | 주변 360° 범위 공격 |
| 🦇 미니언 | 3 | 공중 유닛 3마리 |
| 🧨 폭탄병 | 2 | 원거리 범위 공격 (지상만) |
| 🎯 화살 | 3 | 넓은 범위의 약한 주문 |

밸런스는 `cards.json`의 숫자만 바꾸면 됩니다.

## 🏍️ 네온 라이더 (`ride.html`)

웹캠으로 **몸을 기울여 조종하는** 네온 고속도로 오토바이 게임. 기획서: [docs/RIDE_PLAN.md](docs/RIDE_PLAN.md)

| 주행 | 충돌 → WASTED |
| --- | --- |
| ![주행](docs/ride.jpg) | ![충돌](docs/ride-crash.jpg) |

- `npm run dev` 후 http://localhost:5173/ride.html (배포본은 `/memoryz/ride.html`, Royale 메뉴 왼쪽 위 링크로도 이동)
- **웹캠**: 두 주먹을 가슴 앞에 들면 핸들을 잡은 것으로 인식해 출발합니다(처음 1.5초 보정).
  핸들 돌리듯 한 손을 내리거나 몸을 기울이면 방향 전환, 화면 쪽으로 숙이면 부스터,
  손을 내리면 브레이크, 두 손을 머리 위로 1초 올리면 다시 시작.
- **키보드/터치**: ← → 방향 · ↓ 브레이크 · Space 부스터 · R 다시 시작 · M 소리 / 화면 좌우 누르기, 두 손가락 부스터
- 차 사이를 1.3m 이내로 스치면 아슬아슬 보너스(콤보) + 부스터 충전. 차에 부딪히면 라이더가 날아가며 슬로모션 → 흑백 → **WASTED**.
- 자세 인식은 MediaPipe Pose(lite)로 브라우저 안에서만 처리합니다. wasm은 빌드에 포함되고, 모델 파일(5.7MB)만 Google 저장소에서 받습니다.

```
src/ride/core/     순수 로직: 바이크·교통·충돌·점수·충돌 후 물리(sim.ts), 포즈→조작 변환(controls.ts)
src/ride/input/    웹캠 + MediaPipe(pose.ts), 키보드/터치(keyboard.ts)
src/ride/render/   Three.js: 도로·도시·네온(road.ts), 차량(vehicles.ts), 콕핏·라이더(bike.ts), 속도계(dashboard.ts), 카메라·후처리(scene.ts)
src/ride/ui/       HUD·오버레이(hud.ts), 웹캠 스켈레톤(skeleton.ts)
tests/ride/        sim / controls 단위 테스트
```

## 🎵 비트 바운스 (`beat.html`)

박자에 맞춰 눌러서 가시·구멍·계단을 뛰어넘는 **리듬 플랫포머** (지오메트리 대시 + 바운스볼 + 리듬 게임 판정). 기획서: [docs/BEAT_PLAN.md](docs/BEAT_PLAN.md)

| 타이틀 (트랙리스트, 뒤에서 1스테이지 데모) | 플레이 |
| --- | --- |
| ![타이틀](docs/beat-title.jpg) | ![플레이](docs/beat.jpg) |

- `npm run dev` 후 http://localhost:5173/beat.html (배포본은 `/memoryz/beat.html`, Royale 메뉴·네온 라이더 타이틀에서도 이동)
- **Space · ↑ · 클릭 · 터치 = 점프.** 누르고 있으면 착지할 때마다 계속 점프, 공중의 링에 닿았을 때 누르면 한 번 더 점프, 노란 발판은 저절로 높이 튐. Esc 일시정지, R 처음부터.
- 공은 박자에 맞춰 저절로 굴러가고, 모든 장애물이 8분음표 격자 위에 있습니다. 눌러야 하는 박자마다 멜로디가 나와서 **맵을 귀로 들을 수 있습니다.**
- 누를 때마다 PERFECT(±45ms) / GREAT(±90ms) / GOOD + 빠름·느림, 콤보, 정확도, 클리어 등급 S~C. 한 번 닿으면 0.9초 뒤 처음부터 (시도 횟수·최고 진행률 저장).
- 스테이지 3개: 첫 박자(108 BPM) · 계단 도시(124 BPM) · 더블 타임(140 BPM). 음악은 파일 없이 WebAudio로 합성합니다.
- 타이틀은 앨범 트랙리스트(↑↓ 선택, Enter 시작), 처음 3번은 장애물마다 안내 말풍선, 화면 아래 빠름/느림 타이밍 막대, 죽으면 진행률 카드(누르면 바로 재시작), 결과에 타이밍 분포 그래프.
- **연습 모드**: 4마디마다 체크포인트. **박자 가이드**: 누를 자리에 화살표 + 공 둘레로 줄어드는 링. **싱크 조절**: 메트로놈에 맞춰 두드리면 자동 보정 (블루투스 이어폰용).
- 맵은 지형이 아니라 **악보**로 씁니다 (`src/beat/core/levels.ts`, 한 줄 = 한 마디, `1`=가시, `_`=구멍, `u`=계단, `^`=발판, `o`=링).
  빌더가 "정답대로 누르는 가상 플레이어"를 실제 물리로 굴려서 점프 꼭대기 밑에 장애물을 놓고,
  테스트가 모든 스테이지에 대해 **정답 박자로 전부 PERFECT 클리어 · 노트 하나라도 빼먹으면 죽음 · 노트마다 ±35ms 어긋나도 생존**을 확인합니다.

```
src/beat/core/     순수 로직: 물리(physics.ts), 악보→지형 빌더(chart.ts), 판정(judge.ts), 스테이지(levels.ts), 기록(records.ts)
src/beat/audio/    합성 악기 + 박자 스케줄러 + 스피커 출력 시각 기준 오디오 시계(music.ts)
src/beat/render/   캔버스 그리기: 카메라, 지형, 공, 이펙트, HUD(draw.ts)
src/beat/ui/       타이틀·결과 화면(screens.ts)
tests/beat/        물리·판정·기록 + 모든 스테이지 자동 검증
```

## 🤖 개인 비서 (`assistant.html`)

원하는 주제의 **최신 소식만 골라 요약**하고, 말하듯 적은 **일정을 정리**하고, **보낼 메시지 초안**을 써 주는 웹앱.
[클로드 코드로 앱 만드는 프롬프트 8가지](https://every-ai-guides.vercel.app/posts/claude-code-app-prompts-8)를 따라 단계별로 만든 연습 프로젝트입니다
(계획: [docs/PRACTICE_PLAN.md](docs/PRACTICE_PLAN.md), 단계별 기록: [docs/assistant/](docs/assistant/)).

| 소식 브리핑 | 일정 확인 카드 | 메시지 초안 |
| --- | --- | --- |
| 주제를 최대 5개 등록 → Claude가 웹 검색해서 주제별 요약 + 출처 링크 (한국어·영어 기사, 요약은 한국어) | "다음 주 화요일 3시 강남역에서 민수랑 미팅" → 날짜·시간·장소를 채운 카드를 확인하고 저장. `.ics` 파일로 공유 | 받는 사람·하고 싶은 말·말투 → 초안 2개, 복사해서 카톡에 붙여 넣기. 일정에서 바로 알림 메시지 쓰기 |

- `npm run dev` 후 http://localhost:5173/assistant.html (배포본은 `/memoryz/assistant.html`)
- 처음 열면 **Anthropic API 키**를 넣습니다 ([콘솔](https://console.anthropic.com/settings/keys)에서 발급).
  키는 이 브라우저의 `localStorage`에만 저장되고, 브라우저가 Claude API를 직접 부릅니다 (서버 없음).
  **콘솔에서 월 사용 한도를 꼭 걸어 두세요.** 브리핑 1번 = 주제마다 Claude 호출 1번 + 웹 검색 최대 3번(설정에서 1~5).
- 모델은 `claude-opus-5-5`. 일정 해석·메시지 초안은 effort `low`로 비용을 줄였습니다.
- AI가 없어도 일정은 **＋ 직접 입력**으로 만들 수 있습니다.

```
src/assistant/core/   순수 로직: 글자 수(text.ts), 날짜·시간대(dates.ts), 검증 규칙(rules.ts),
                      저장(store.ts), 캘린더 파일(ics.ts), Claude 응답 검사(validate.ts)
src/assistant/ai.ts   Claude 호출 전부 (웹 검색 + submit_briefing 도구, structured outputs)
src/assistant/prompts.ts  지시문과 JSON 스키마
src/assistant/ui/     화면: 시작(start) 소식(news) 일정(events) 메시지(messages) 설정(settings)
tests/assistant/      150개: 경계 값, 저장소 오류, .ics, 지어낸 출처 차단, 가짜 네트워크로 Claude 호출
```

**알려진 한계**
- API 키가 브라우저에 암호화 없이 저장됩니다 → 개인 기기에서만 쓰세요.
- 데이터는 이 브라우저에만 있습니다. 브라우저 데이터를 지우면 함께 사라지고, 다른 기기와 동기화되지 않습니다.
- 앱이 열려 있을 때만 동작합니다 (정해진 시간 자동 브리핑·알림 없음).
- 진짜 Claude 응답과 실제 휴대폰에서의 복사·`.ics` 열기는 아직 확인 전입니다 ([07-release.md](docs/assistant/07-release.md)).

**다음에 할 일 (우선순위 순)**
1. 진짜 API 키로 [04-build.md](docs/assistant/04-build.md)의 "실행해 보지 못한 것" 확인 — 특히 출처 주소 일치율과 상대 날짜 계산
2. 아이폰 사파리·안드로이드 크롬에서 복사 버튼, `.ics` 파일 열기 확인
3. 메모 기능 (v1에서 뺀 1순위)
4. 브리핑 비용 표시 (응답의 사용량으로 1회 비용 보여 주기)
5. 작은 서버(예: Vercel 함수) 추가 → 키를 서버에 숨기고, 다른 사람과 실시간 일정 공유·정해진 시간 자동 브리핑

## 📣 홍보 에이전트 (`promo/`, `src/promo/`)

블로그 · 인스타그램 · 쓰레드에 **알아서 글을 올리고 댓글을 관리하는** 에이전트. GitHub Actions에서 매시간 돌아서 서버가 필요 없습니다.
기획서: [docs/promo/PLAN.md](docs/promo/PLAN.md) · 계정 연결: [docs/promo/SETUP.md](docs/promo/SETUP.md)

| 글 만들기 (정해진 요일·시간) | 댓글 관리 (매시간) |
| --- | --- |
| ① 주제 정하기 → ② 같은 주제의 인기 글을 웹에서 찾아 후킹·구성·해시태그 분석 → ③ `promo/templates/`의 **내 글 구성대로** 세 플랫폼 글 쓰기 → ④ 규칙 검사 + Claude 검수 → ⑤ 카드뉴스 이미지 렌더링 → ⑥ 발행 | 새 댓글 분류 → 칭찬·FAQ로 답할 수 있는 질문·구매 문의는 답글, 스팸·욕설은 숨김, 불만·민감한 댓글은 답하지 않고 `inbox.md` + 알림으로 사람에게 |

- **쓰레드**(타래 글), **인스타그램**(카드뉴스 캐러셀), **워드프레스**는 자동 발행. **네이버 블로그·티스토리**는 글쓰기 API가 종료돼서 붙여넣기용 발행본을 만들어 알려 줍니다.
- 사용자는 `promo/`의 파일(브랜드 설명, 글 구성, FAQ, 참고 계정)과 각 플랫폼 **공식 토큰**만 준비합니다. 비밀번호 로그인 자동화는 쓰지 않습니다(약관 위반·정지 위험).
- `mode: auto`는 검수를 통과하면 바로, `mode: review`는 초안(`promo-data/drafts/*.md`)의 `status`를 `approved`로 바꾸면 올라갑니다.
- 기록(발행 내역, 처리한 댓글, 초안, 실행 보고서)은 `promo-data` 브랜치에, 카드 이미지는 `promo-media` 브랜치에 쌓입니다.
- **홍보 자동화 화면 (`promo.html`)**: 처음 화면에 **블로그 자동화 · 인스타그램 자동화 · 쓰레드 자동화** 카드 3개.
  카드마다 계정 등록(토큰은 GitHub Secrets에 암호화 저장), **글 만들기**(미리보기 → 고치기 → 지금 올리기), **자동으로 올리기** 스위치와 주기(매일·평일·주 3회·주 2회·주 1회·요일 직접 + 시간).
  플랫폼마다 주기가 따로라 `promo/config.yml`의 `platforms.<이름>.schedule`에 저장되고, 에이전트가 플랫폼별로 차례를 계산합니다.
  배포본은 `/memoryz/promo.html`. 설정에서 저장소와 fine-grained 토큰(Contents·Actions·Secrets·Variables 읽기·쓰기)을 넣으면 실제로 동작하고, 넣기 전에는 미리보기입니다.

```bash
npm run promo -- check                 # 설정·토큰·이미지 저장소 연결 확인 (아무것도 올리지 않음)
npm run promo -- preview --topic "…"   # 올리지 않고 초안 + 카드 이미지만 → .promo-data/
npm run promo -- run                   # 평소 실행 (Actions가 매시간 하는 일)
```

```
promo/                    사용자가 채우는 설정: config.yml, brand.md, faq.md, references.md, templates/
src/promo/core/           순수 로직: 설정 검사(config), 슬롯 계산(schedule), 글자 수·금지어·링크 규칙(rules),
                          초안 파일(draft), 댓글 정책(comments), 기록(state), 토큰 암호화(secrets)
src/promo/ai/             Claude 호출: 주제 → 레퍼런스 조사(웹 검색·열람) → 쓰기 → 검수, 댓글 분류
src/promo/platforms/      threads · instagram · wordpress · naver(발행본) — 공식 API만
src/promo/media/          카드뉴스 HTML → JPEG(Chromium), GitHub에 공개 이미지 올리기
src/promo/agent.ts        실행 흐름, 보고서·inbox·알림      .github/workflows/promo.yml  매시간 실행
src/promo/ui/             홍보 자동화 화면 (promo.html): 계정→Secrets, 주기→config.yml, 글 만들기→워크플로 실행
tests/promo/              가짜 네트워크·가짜 Claude로 발행·재시도·승인·댓글 정책까지
```

## 배포 (GitHub Pages)

`.github/workflows/ci.yml`이 모든 push에서 테스트와 빌드를 돌리고, 저장소 **기본 브랜치**에 push되면
https://memoryzkr-hash.github.io/memoryz/ 로 자동 배포합니다. 처음 한 번은 저장소 **Settings → Pages → Source**를
**GitHub Actions**로 바꾼 뒤, Actions 탭에서 CI를 다시 실행하면 됩니다.

폰에서는 위 주소를 열고 브라우저 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 전체 화면으로 실행됩니다.

## 구조

```
src/core/     게임 규칙 (Phaser 의존 없음, 결정적 20Hz 시뮬레이션)
  sim.ts        게임 생성, 카드 사용, 틱 진행, 승패 판정
  combat.ts     타겟팅, 공격, 스플래시
  movement.ts   다리를 통한 이동, 충돌 밀어내기
  ai.ts         규칙 기반 AI 상대
src/audio/    WebAudio로 합성한 효과음 (파일 없음)
src/render3d/ Three.js 3D 전장: 유닛/타워 모델(models.ts), 경기장(arena.ts),
              애니메이션·이펙트(world.ts), 카드 초상화 렌더링(cardArt.ts)
src/render/   화면 레이아웃 상수
src/ui/       손패, 엘릭서 바, 버튼
src/scenes/   메뉴 / 배틀 / 덱 편집 / 결과 씬
tests/        core 단위 테스트
```

게임 로직(`src/core`)이 렌더링과 분리되어 있어서, 나중에 멀티플레이 서버에서 그대로 재사용할 수 있습니다.
플레이어 입력은 모두 `playCard(state, { side, handIndex, x, y })` 명령 하나로 들어갑니다.

유닛과 타워는 외부 에셋 없이 코드로 만든 오리지널 3D 모델(카툰 셰이딩)이고, 카드 그림도 이 모델을 렌더링해서 만듭니다.
개발 중에는 `http://localhost:5173/showcase.html`에서 모든 모델을 가까이서 볼 수 있습니다 (`?towers`로 타워). 개발 계획은 [docs/PLAN.md](docs/PLAN.md)를 참고하세요.

## 📊 클로드 사용량 (`usage.html`)

클로드 계정을 여러 개 등록해 두고 **계정마다 주간 한도 초기화 시각과 그때까지 쓴 %**를 한 화면에서 보는 관리 페이지. 기획서: [docs/USAGE_PLAN.md](docs/USAGE_PLAN.md)

- **초기화 일정** 타임라인으로 앞으로 7일 동안 어느 계정이 언제 초기화되는지 한눈에 봅니다.
- 주간 초기화 시각은 "매주 토요일 10:23"처럼 한 번만 넣으면 자동으로 넘어가고, 지난 기록은 "초기화됨 · 업데이트 필요"로 표시됩니다.
- 계정마다 다이얼 게이지: 호는 쓴 %, 바늘은 이번 주에 흐른 시간입니다. 호가 바늘보다 길면 빨리 쓰는 중이고, 지금 속도로 초기화 때 몇 %가 될지 예상치를 보여 줍니다.
- **지금 쓸 계정**: 남은 % ÷ 초기화까지 남은 시간이 가장 큰 계정을 추천합니다(곧 초기화되는데 많이 남은 계정이 먼저 나옵니다). 세션 한도에 걸렸거나 소진된 계정은 빠집니다.
- 5시간 세션 사용량, 결제 갱신일(D-day), 메모도 함께 관리합니다.
- **맥에서 자동으로 불러오기**: [`tools/claude-usage`](tools/claude-usage/README.md) 스크립트로 계정마다 한 번 연결해 두면, `claude-usage` 한 줄로 모든 계정 사용량을 가져와 페이지에 Cmd+V로 반영합니다. 로그인 정보는 받지 않고 토큰은 맥 키체인에만 저장합니다. (맥이 아니면 북마클릿, 실험적)
- 저장: claude.ai 아티팩트로 열면 클라우드(본인만), 그 밖에서는 이 브라우저(localStorage).

```bash
npm run dev                                 # http://localhost:5173/usage.html
node scripts/build-usage-artifact.mjs       # dist-artifact/usage.html 한 파일로 묶기 (아티팩트용)
```

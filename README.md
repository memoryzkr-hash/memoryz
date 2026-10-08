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

## 🧳 여행 플래너 (`travel.html`)

어디든 여행 일정을 짜 주고, 그 일정대로 **움직이는 모습을 지도 위에서 시뮬레이션**하면서 **이동 시간과 비용을 미리 계산**해 주는 웹앱.
기획서: [docs/TRAVEL_PLAN.md](docs/TRAVEL_PLAN.md)

- `npm run dev` 후 http://localhost:5173/travel.html (배포본은 `/memoryz/travel.html`)
- **바로 시연**: API 키 없이 샘플 여행 4개(서울 하루 · 제주 1박 2일 렌터카 · 도쿄 · 파리)가 들어 있습니다. ▶를 누르면 여행자가 시간표대로 이동하고,
  왼쪽 위에 현재 시각 · 하는 일 · 지금까지 쓴 돈 · 이동 거리가 실시간으로 나옵니다. 속도(1초에 1분~1시간), 되감기, 따라가기 가능.
- **✨ 새 여행 → Claude에게 맡기기**: 여행지·기간·인원·예산·일정 밀도·관심사를 적으면 Claude(`claude-opus-5-5`)가 날짜별 방문지와 좌표를 짭니다.
  키는 개인 비서와 같은 `localStorage` 항목을 함께 씁니다.
- **예측은 AI가 아니라 공식으로**: 직선거리 × 수단별 우회 계수, 수단별 속도·대기 시간, 출퇴근 시간 정체(×1.35), 지역별 요금표(택시 기본요금·심야 할증,
  지하철 거리 비례 요금, 택시는 4명당 1대), 개장 시간 대기, 숙박(2인 1실). 그래서 같은 계획이면 언제나 같은 숫자가 나옵니다.
- **고쳐 보면서 비교**: 구간마다 수단을 바꾸거나 **수단 비교**표에서 고르기, 머무는 시간 ±15분, 순서 바꾸기·빼기(되돌리기), 지도를 눌러 장소 추가,
  **🔀 동선 최적화**(처음·마지막 숙소는 그대로 두고 이동 시간이 가장 짧은 순서로). 바꿀 때마다 시간표·비용·경고(마감 후 도착, 23시 넘김,
  30분 넘는 도보, 예산 초과)가 바로 다시 계산됩니다.

```
src/travel/core/   순수 로직: 거리·경로 곡선(geo.ts), 수단별 시간·요금(modes.ts), 지역 요금표·환율(regions.ts),
                   시간표·비용·경고(schedule.ts), 이동 시뮬레이션(sim.ts), 동선 최적화(optimize.ts), 검사(validate.ts), 저장(store.ts)
src/travel/ai.ts   Claude 호출 (structured outputs JSON 스키마, 거절 시 서버 측 폴백)
src/travel/ui/     Leaflet 지도(map.ts), 재생기·HUD(player.ts), 일정 패널(panel.ts), 새 여행·장소 추가 시트(create.ts)
tests/travel/      엔진·시뮬레이션·최적화·검사·저장소 + 가짜 네트워크로 Claude 호출
```

**알려진 한계**: 지도의 선은 실제 도로가 아니라 직선을 살짝 휜 곡선이고, 요금·환율은 2026년 기준 대략값입니다.
실시간 교통·항공권·숙소 가격, 영업일(휴관일)은 반영하지 않습니다. 지도 그림은 OpenStreetMap에서 받아 오므로 인터넷이 필요합니다.

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

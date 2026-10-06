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

## 🥊 아레나 스킬 (`.claude/skills/arena`)

소개 페이지와 실제 경기 다시보기: `arena.html` (배포본 `/memoryz/arena.html`)

Claude 답이 마음에 안 들 때, 같은 과제를 하위 에이전트 여럿에게 **서로 다른 사고 카드**
(사고법 15 × 작업흐름 12 × 전략 12 = 2,160장)로 풀게 하고, 1:1 토너먼트로 한 답만 남기는 Claude Code 스킬입니다.

- 경기마다 **공격**(서로의 답에서 FATAL · MAJOR · MINOR 결함 찾기) → **방어**(인정하거나 근거로 반박하고 답 고치기)
  → **심판**(정확성 30 · 완결성 25 · 견고성 20 · 구체성 15 · 명료성 10). 치명적 결함이 남은 답은 결함 없는 답을 못 이깁니다.
- 이 저장소를 Claude Code로 열면 바로 쓸 수 있습니다: `/arena <과제>` 또는 "이거 대결 붙여줘".
  다른 프로젝트에서도 쓰려면 `cp -r .claude/skills/arena ~/.claude/skills/`.
- 필요한 것: Claude Code + Python 3.8+ (표준 라이브러리만). 결과는 `.arena/<id>/result.md`, `final.md`.

| 옵션 | 참가 | 라운드 | 하위 에이전트 호출 |
| --- | --- | --- | --- |
| `--quick` | 8 | 3 | 43 |
| (기본) | 16 | 4 | 91 |
| `--agents 32` / `64` | 32 / 64 | 5 / 6 | 187 / 379 |
| `--full` | 100 | 7 | 595 |

토큰은 쓰는 사람의 Claude 구독/요금에서 나갑니다. 같은 모델이 다른 지시로 푸는 것이지 "서로 다른 AI 100개"가 아니고,
과제가 나쁘면 결과도 나쁩니다. 하위 에이전트는 대화를 못 보고 `task.md`만 읽기 때문에 스킬이 과제를 먼저 정리해서 씁니다.

```
.claude/skills/arena/SKILL.md            Claude가 따르는 진행 순서
.claude/skills/arena/scripts/arena.py    장부: 카드 뽑기, 대진·부전승, 프롬프트 파일, 판정 집계, 결과 파일
.claude/skills/arena/scripts/cards.py    카드 2,160장
.claude/skills/arena/tests/              가짜 에이전트로 토너먼트 전체를 돌리는 테스트
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

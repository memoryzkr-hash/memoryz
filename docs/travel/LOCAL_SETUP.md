# 여행 플래너 — 내 컴퓨터에서 돌리기

대화로 여행 일정을 짜고, 실제 3D 지도 위에서 하루 이동을 재생하며 시간·비용을 미리 계산하는 웹앱입니다.

## 1. 준비 (처음 한 번)

1. **Node.js 22 LTS** 설치: https://nodejs.org → "LTS" 버튼 → 설치 프로그램 실행
   - 확인: 터미널(맥: 터미널, 윈도우: PowerShell)에서 `node -v` → `v22.…` 이 나오면 됩니다.
2. 받은 `travel-planner.zip`을 원하는 곳에 풀고, 터미널에서 그 폴더로 이동합니다.
   ```bash
   cd 경로/travel-planner
   ```
3. 필요한 패키지 설치 (1~2분):
   ```bash
   npm install
   ```

## 2. 실행

```bash
npm run dev
```
터미널에 `http://localhost:5173/` 이 나오면 브라우저(크롬·사파리·엣지)로 엽니다. 끌 때는 터미널에서 `Ctrl + C`.

- **바로 시연**: 대화 첫 화면의 `샘플 · 서울/제주/도쿄/파리`를 누르고 → `지도에서 이동 보기` → ▶
- **AI로 일정 만들기**: 질문에 답하고 `이대로 일정 만들기`를 누르면 **Anthropic API 키**를 물어봅니다.
  - 키 받는 곳: https://console.anthropic.com/settings/keys (콘솔에서 **월 사용 한도**를 꼭 걸어 두세요)
  - 키는 이 브라우저(localStorage)에만 저장되고, 브라우저가 Claude API를 직접 부릅니다. 서버는 없습니다.
- **내 위치**: 지도 오른쪽 위 📍 → 위치 허용 → 파란 점 + "지금 내 위치에서 가장 가까운 곳" 카드.
  (localhost에서는 됩니다. 휴대폰은 아래 4번 참고)

## 3. 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (코드 고치면 바로 새로고침) |
| `npm test` | 테스트 실행 (엔진·대화 흐름·길찾기·AI 호출을 가짜 네트워크로) |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | `dist/` 폴더에 배포용 정적 파일 생성 → 아무 정적 호스팅에 올리면 끝 |
| `npm run preview` | 빌드한 결과를 내 컴퓨터에서 미리 보기 |
| `npm run build:artifact` | claude.ai 링크(아티팩트)용 한 파일 `dist-artifact/travel.html` |

## 4. 휴대폰에서 보기

- 같은 와이파이: `npm run dev -- --host` → 터미널에 나오는 `Network: http://192.168.x.x:5173` 을 휴대폰에서 열기.
  화면은 되지만 **내 위치는 HTTPS가 아니라서 막힙니다.**
- 내 위치까지 쓰려면 HTTPS 주소가 필요합니다. 둘 중 하나:
  - 배포: `npm run build` 후 `dist/`를 GitHub Pages · Netlify · Vercel · Cloudflare Pages에 올리기
  - 임시 터널: `npx cloudflared tunnel --url http://localhost:5173` → 나오는 `https://….trycloudflare.com` 을 휴대폰에서 열기

## 5. 쓰는 외부 서비스 (모두 키 없이 무료)

| 무엇 | 서비스 | 안 될 때 |
| --- | --- | --- |
| 지도·3D 건물 | OpenFreeMap (`tiles.openfreemap.org`) | 회사·학교망이 막으면 무지 배경 위 경로도로 자동 전환 |
| 지형 높낮이 | AWS Terrain Tiles | 평평하게 보임 |
| 실제 도로 경로 | OSRM 공개 서버 (`routing.openstreetmap.de`, `router.project-osrm.org`) | 직선 기준 추정으로 자동 전환. 공개 서버라 가끔 느림 |
| AI 일정 | Anthropic API (본인 키) | 샘플 여행·직접 수정은 키 없이 됨 |

## 6. 문제 해결

| 증상 | 해결 |
| --- | --- |
| `npm: command not found` | Node.js 설치 후 터미널을 새로 열기 |
| `Port 5173 is in use` | 다른 창의 `npm run dev`를 끄거나 `npm run dev -- --port 5174` |
| 지도가 회색이고 "지도 이미지 없이" 표시 | 네트워크가 OpenFreeMap을 막음. 다른 와이파이에서 확인 |
| 📍 눌러도 반응 없음 | 브라우저 주소창 왼쪽 자물쇠 → 위치 허용. `http://IP주소`로 열었다면 4번 참고 |
| "API 키가 맞지 않아요" | 콘솔에서 키 다시 복사 (앞에 `sk-ant-`) |
| 화면이 이상하게 남아 있음 | 브라우저 개발자도구 → Application → Local Storage에서 `travel.v1.*` 지우기 |

## 7. 폴더 구조

```
index.html                 앱 시작 페이지
src/travel/main.ts         화면 조립·상태 (대화 ↔ 지도 ↔ 일정)
src/travel/chat/flow.ts    대화 질문 순서·건너뛰기·답 해석·추천지 (데이터)
src/travel/core/           순수 계산: 거리(geo) 수단별 시간·요금(modes) 나라별 요금표(regions)
                           시간표·비용·경고(schedule) 이동 시뮬레이션(sim) 동선 최적화(optimize)
                           한 번에 고치기(tweaks) 실제 도로 형식(roads) 검사(validate) 저장(store)
src/travel/ai.ts           Claude 호출 (일정 만들기·고치기). prompts.ts에 지시문과 JSON 모양
src/travel/samples.ts      샘플 여행 4개
src/travel/ui/             대화(chat) 3D 지도(map) 재생기·시간표 띠(player) 일정·비용 탭(panel)
                           길찾기 요청·캐시(roadbook) 장소 추가 창(create)
src/assistant/             (공용) 화면 도우미 dom.ts, API 키 검사, Claude 오류 처리
tests/travel/              테스트
docs/                      기획서(TRAVEL_PLAN) · 실시간 지도 가이드(REALTIME_MAP) · 인수인계(HANDOFF)
```

# MemoryZ 시간표 (Expo / React Native)

MemoryZ 앱의 **시간표 탭**입니다. 피그마 [MemoryZ UI Design](https://www.figma.com/design/9cH1fuRVsXi9IaoAzbfBEB/MemoryZ-UI-Design)의
`Sprint1-시간표 › 시간표-Mobile` 화면을 기준으로 만들었고, **AI 계획 세우기**가 들어 있습니다. iOS · Android · 웹에서 동작합니다.

## 내 컴퓨터에서 실행하기

### 1. 준비물

- [Node.js](https://nodejs.org) **22.18 이상** (LTS 설치 버튼으로 받으면 됩니다)
- AI 계획 세우기를 쓰려면 Claude API 키 ([console.anthropic.com](https://console.anthropic.com)에서 발급)

### 2. 켜기

| 컴퓨터 | 방법 |
| --- | --- |
| macOS | `timetable-app` 폴더의 **start.command** 더블클릭 (처음에 "확인되지 않은 개발자" 경고가 나오면 우클릭 → 열기) |
| Windows | `timetable-app` 폴더의 **start.bat** 더블클릭 |
| 터미널 | `cd timetable-app && npm install && npm run dev -- --web` |

처음 켜면 필요한 패키지를 설치하고(몇 분 걸려요) `.env` 파일을 만든 뒤, 브라우저에 앱이 열립니다.

### 3. AI 키 넣기

`timetable-app/.env` 파일을 메모장으로 열어 키를 넣고, 창을 닫았다가 다시 켭니다.

```
ANTHROPIC_API_KEY=sk-ant-...
EXPO_PUBLIC_PLANNER_API_URL=http://localhost:8788
```

키는 컴퓨터에서 도는 AI 서버(`server/planner-server.ts`)만 읽고 앱에는 들어가지 않습니다. `.env`는 git에 올라가지 않습니다.

### 휴대폰에서 보기 (Expo Go)

1. 휴대폰에 **Expo Go** 앱을 설치하고 컴퓨터와 같은 와이파이에 연결합니다.
2. `.env`의 주소를 이 컴퓨터의 IP로 바꿉니다: `EXPO_PUBLIC_PLANNER_API_URL=http://192.168.0.12:8788`
   (IP 확인: macOS `시스템 설정 → Wi-Fi → 세부사항`, Windows `ipconfig`의 IPv4 주소)
3. 터미널에서 `npm run dev`를 실행하고 화면의 QR 코드를 휴대폰 카메라(iOS)나 Expo Go(Android)로 찍습니다.

### 잘 안 될 때

| 증상 | 해결 |
| --- | --- |
| AI 화면에 "AI가 연결되어 있지 않아요" | `.env`에 `EXPO_PUBLIC_PLANNER_API_URL`이 있는지 확인하고 앱을 다시 켜기 |
| "ANTHROPIC_API_KEY가 없어요" | `.env`에 키를 넣고 다시 켜기 |
| "AI 서버에 연결하지 못했어요" | 터미널에 `AI 계획 서버: http://localhost:8788`이 떠 있는지 확인, 휴대폰이면 주소를 컴퓨터 IP로 |
| `node: bad option` 같은 오류 | Node.js를 22.18 이상으로 업데이트 |

## AI 계획 세우기

**주간 일정 → 계획 세우기**를 누르면 AI와 대화하는 화면이 열립니다.

- "면역학 복습 4시간, 약물학 과제 3시간 넣어줘"처럼 말하면, AI가 이번 학기 고정 일정(수업)을 피해 빈 시간에 공부 일정을 직접 넣습니다.
- 넣은 일정은 **하루**와 **주간 일정**에 바로 보이고, 손으로 넣은 일정처럼 체크·수정·삭제할 수 있습니다.
- AI는 세 가지 도구만 씁니다: 일정·빈 시간 보기(`get_schedules`), 일정 넣기(`add_schedules`), 일정 지우기(`delete_schedules`). 30분 단위가 아니거나, 09:00~24:00 밖이거나, 겹치거나, 지난 시간이면 앱이 거절하고 AI가 다른 시간으로 다시 넣습니다.
- 화면 위 **직접 고르기**를 누르면 피그마의 칸 선택 방식으로 직접 계획할 수 있습니다.

### AI 서버 API (GCP 등 다른 서버에 연결할 때)

앱은 `EXPO_PUBLIC_PLANNER_API_URL` + `/plan`으로 대화를 보냅니다. 같은 형식을 따르는 서버라면 어디든(GCP Cloud Run 포함) 주소만 바꿔 연결할 수 있습니다. `server/planner-server.ts`가 참고 구현입니다.

```
POST /plan
요청  { "context": "지금: 2026-10-05 (월) 10:10\n계획할 주: …",   // 앱이 매번 만드는 현재 상황
        "messages": [ …Claude Messages API 형식의 대화… ] }
응답  { "content": [ …Claude 응답 블록(text, tool_use 등)… ], "stop_reason": "tool_use" | "end_turn" | … }
오류  { "error": "사용자에게 보여줄 문장" } + 4xx/5xx
```

- 서버는 `src/ai/spec.ts`의 지시문(`PLANNER_INSTRUCTIONS`)과 도구 정의(`PLANNER_TOOLS`)를 system·tools로 넣어 Claude를 호출하고, 응답을 그대로 돌려줍니다.
- 도구는 앱이 실행합니다: `stop_reason`이 `tool_use`면 앱이 도구를 실행해 `tool_result`를 붙여 다시 `/plan`을 부릅니다(최대 8번).
- 받은 `content` 블록은 앱이 그대로 다시 보내므로 서버가 내용을 바꾸면 안 됩니다.

## 개발

```bash
npm test             # 플래너·AI 도구 로직 단위 테스트
npm run typecheck
npm run server       # AI 서버만 켜기
npm run web          # 앱만 켜기 (AI 서버 없이)
```

`EXPO_PUBLIC_DEMO=1 npx expo export --platform web`로 빌드하면, 저장된 데이터가 없을 때 이번 주에 맞춘 피그마 예시 일정이 들어간 데모가 만들어집니다. claude.ai 아티팩트 안에서 열면 AI 서버 없이 Claude에 바로 연결됩니다.

## 화면 (피그마 프레임 → 구현)

| 피그마 | 기능 |
| --- | --- |
| 시간표 / Default · Empty · 오늘일정완료 | **하루** 탭: 날짜 이동, 그날 일정 목록, 체크하면 "4시간 40분 중 1시간 50분 공부 완료" 진행 막대, 모두 완료하면 완료 표시, 일정이 없으면 빈 화면 |
| 주간일정 / Default · Empty | **주간 일정** 탭: 월~일 시간표(옆으로 밀면 토·일), 블록을 누르면 수정 |
| 일정추가 / 시간선택전 · 시간선택후 · 제목작성 | 30분 칸을 눌러 시간 선택(이미 일정이 있는 칸은 회색) → 고정/일회성 선택 + 제목 입력 |
| 일정수정 / Default · 시간변경 · 일정삭제모달 | 제목·종류 수정, 시간 칩을 누르면 주간 그리드에서 시간 변경, 삭제 확인 |
| 캘린더 / Default · 년월설정 | 날짜 아래에 그날 순 공부시간 표시, 년·월 이동 |
| 시간표목록 / Default · 시간표추가 · 시간표삭제모달 | 학기별 시간표 전환(현재 시간표는 연도를 주황색으로), 추가·삭제 |
| 시간표계획세우기 / Default · 시간선택 · 계획세우기취소모달 | **직접 고르기**: 한 주 여러 요일의 시간을 한 번에 골라 추가, 저장 전에 나가면 확인 |

규칙(피그마 주석 기준)

- **이번 학기 고정 일정**은 매주 같은 요일에 반복되고 배경색이 랜덤으로 정해집니다. **일회성 일정**은 그날 하루만, 회색으로 표시됩니다.
- 완료 체크는 날짜별로 저장됩니다. 고정 일정을 이번 주에 체크해도 다음 주에는 다시 미완료입니다.
- 시간표는 09:00~24:00, 30분 단위입니다.
- 데이터는 기기에 저장됩니다(AsyncStorage).

## 구조

| 경로 | 역할 |
| --- | --- |
| `App.tsx` | 화면 전환, 바텀시트·모달 상태 |
| `src/planner.ts`, `src/date.ts` | 일정 계산·칸 선택·포맷 등 순수 로직 (`tests/`에서 테스트) |
| `src/ai/` | AI 지시문·도구 정의(`spec.ts`), 도구 실행(`tools.ts`), 연결(`agent.ts`) |
| `server/planner-server.ts` | AI 중계 서버 (API 키 보관, Claude 호출) |
| `src/store.ts` | 상태 리듀서와 기기 저장 |
| `src/theme.ts` | 피그마 변수(색·글꼴·radius) 토큰 |
| `src/screens/` | 하루, 주간 일정, AI 계획 세우기, 칸 선택 화면(일정 추가·시간 변경·직접 고르기) |
| `src/components/` | 피그마 컴포넌트(App bar, UnderlineTabs, Schedule List, Bottom sheet, Action Modal 등) |
| `assets/icons/` | 피그마에서 내보낸 SVG 아이콘 |
| `assets/fonts/` | Pretendard (SIL OFL 1.1, `OFL-LICENSE.txt`) |
| `start.command`, `start.bat`, `scripts/dev.mjs` | 더블클릭 실행 / AI 서버 + 앱 함께 켜기 |

## 디자인과 다른 점

- 하단 탭(홈·학습·복습·마이)은 모양만 있고 시간표 탭만 동작합니다.
- **계획 세우기**는 AI 대화 화면으로 바꿨습니다(피그마에 없는 화면이라 같은 디자인 토큰으로 만들었습니다). 피그마의 칸 선택 화면은 "직접 고르기"로 남아 있습니다.
- 피그마가 버튼 안의 `+` 아이콘을 플레이스홀더로 내보내서, 디자인 시스템의 `plus-32px` 아이콘을 썼습니다. 주황 버튼에 쓰는 흰색 아이콘은 같은 SVG에서 색만 바꿨습니다.
- 주간 날짜 범위를 피그마 예시("9월 20일~26일", 일~토)와 달리 화면 열 순서에 맞춰 월~일로 계산합니다.
- 일정 추가 화면에서 칸을 고르기 전 오른쪽 버튼은 "일정 추가"(비활성)로 표시합니다.

# MemoryZ 시간표 (Expo / React Native)

MemoryZ 앱의 **시간표 탭**입니다. 피그마 [MemoryZ UI Design](https://www.figma.com/design/9cH1fuRVsXi9IaoAzbfBEB/MemoryZ-UI-Design)의
`Sprint1-시간표 › 시간표-Mobile` 화면을 기준으로 만들었습니다. iOS · Android · 웹에서 동작합니다.

## 실행

```bash
cd timetable-app
npm install
npm start          # Expo Go 앱으로 QR 스캔 (iOS/Android)
npm run web        # 브라우저에서 보기
npm test           # 플래너 로직 단위 테스트
npm run typecheck
```

`EXPO_PUBLIC_DEMO=1 npx expo export --platform web`로 빌드하면, 저장된 데이터가 없을 때 이번 주에 맞춘 피그마 예시 일정이 들어간 데모가 만들어집니다.

## 화면 (피그마 프레임 → 구현)

| 피그마 | 기능 |
| --- | --- |
| 시간표 / Default · Empty · 오늘일정완료 | **하루** 탭: 날짜 이동, 그날 일정 목록, 체크하면 "4시간 40분 중 1시간 50분 공부 완료" 진행 막대, 모두 완료하면 완료 표시, 일정이 없으면 빈 화면 |
| 주간일정 / Default · Empty | **주간 일정** 탭: 월~일 시간표(옆으로 밀면 토·일), 블록을 누르면 수정 |
| 일정추가 / 시간선택전 · 시간선택후 · 제목작성 | 30분 칸을 눌러 시간 선택(이미 일정이 있는 칸은 회색) → 고정/일회성 선택 + 제목 입력 |
| 일정수정 / Default · 시간변경 · 일정삭제모달 | 제목·종류 수정, 시간 칩을 누르면 주간 그리드에서 시간 변경, 삭제 확인 |
| 캘린더 / Default · 년월설정 | 날짜 아래에 그날 순 공부시간 표시, 년·월 이동 |
| 시간표목록 / Default · 시간표추가 · 시간표삭제모달 | 학기별 시간표 전환(현재 시간표는 연도를 주황색으로), 추가·삭제 |
| 시간표계획세우기 / Default · 시간선택 · 계획세우기취소모달 | 한 주 여러 요일의 시간을 한 번에 골라 고정 일정으로 추가, 저장 전에 나가면 확인 |

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
| `src/store.ts` | 상태 리듀서와 기기 저장 |
| `src/theme.ts` | 피그마 변수(색·글꼴·radius) 토큰 |
| `src/screens/` | 하루, 주간 일정, 칸 선택 화면(일정 추가·시간 변경·계획 세우기) |
| `src/components/` | 피그마 컴포넌트(App bar, UnderlineTabs, Schedule List, Bottom sheet, Action Modal 등) |
| `assets/icons/` | 피그마에서 내보낸 SVG 아이콘 |
| `assets/fonts/` | Pretendard (SIL OFL 1.1, `OFL-LICENSE.txt`) |

## 디자인과 다른 점

- 하단 탭(홈·학습·복습·마이)은 모양만 있고 시간표 탭만 동작합니다.
- 피그마가 버튼 안의 `+` 아이콘을 플레이스홀더로 내보내서, 디자인 시스템의 `plus-32px` 아이콘을 썼습니다. 주황 버튼에 쓰는 흰색 아이콘은 같은 SVG에서 색만 바꿨습니다.
- 주간 날짜 범위를 피그마 예시("9월 20일~26일", 일~토)와 달리 화면 열 순서에 맞춰 월~일로 계산합니다.
- 일정 추가 화면에서 칸을 고르기 전 오른쪽 버튼은 "일정 추가"(비활성)로 표시합니다.

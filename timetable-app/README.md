# 시간표 앱 (Expo / React Native)

주간 시간표를 만들고 오늘 수업을 한눈에 보는 앱입니다. iOS · Android · 웹에서 동작합니다.

> 지금은 기본 디자인입니다. 피그마 디자인이 들어오면 `src/theme.ts`의 색 토큰과 각 컴포넌트 스타일을 맞춥니다.

## 실행

```bash
cd timetable-app
npm install
npm start          # Expo Go 앱으로 QR 스캔 (iOS/Android)
npm run web        # 브라우저에서 보기
npm test           # 시간표 로직 단위 테스트
npm run typecheck
```

## 기능

- **주간 시간표**: 월~금 그리드(토·일 수업이 있으면 자동으로 열 추가), 수업 시간대에 맞춰 9시~18시 밖으로도 자동 확장
- **빈 칸 탭 → 그 요일·시간으로 새 수업**, 수업 블록 탭 → 수정/삭제
- 과목명 · 강의실 · 교수명 · 요일 · 시작/종료(5분 단위, 길게 누르면 30분) · 색상
- **시간 겹침 검사**: 같은 요일에 겹치는 수업이 있으면 저장하지 않고 알려줌
- **오늘 탭**: 지금 진행 중인 수업 / 다음 수업, 오늘 수업 목록
- 현재 시각 빨간 선 표시, 기기에 자동 저장(AsyncStorage)

## 구조

| 파일 | 역할 |
| --- | --- |
| `App.tsx` | 화면 전환(주간/오늘), 수업 추가·수정·삭제 상태 |
| `src/timetable.ts` | 시간 계산, 겹침 검사, 그리드 범위 등 순수 로직 (`tests/`에서 테스트) |
| `src/components/TimetableGrid.tsx` | 주간 시간표 그리드 |
| `src/components/TodayView.tsx` | 오늘 수업 화면 |
| `src/components/CourseEditor.tsx` | 수업 추가/수정 시트 |
| `src/storage.ts` | 기기 저장 |
| `src/theme.ts` | 색 토큰 |

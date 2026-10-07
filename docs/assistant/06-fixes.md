# 06 버그 수정 — 개인 비서

> 입력: [05-tests.md](05-tests.md)의 실패 2개 · 다음 단계: 07 출시 점검

테스트는 지우거나 기대값을 바꾸지 않았습니다. 고친 곳은 3개 파일, 10줄입니다.

## 실패 1 — 되돌리기로 주제가 6개가 됨

- **근거**: `store.test.ts:56` `expect(store.restoreTopic(removed)).toBe(false)` → `true`.
  `src/assistant/core/store.ts`의 `restoreInto`가 개수 제한을 보지 않고 `next.splice(...)`로 바로 끼워 넣음.
- **수정**: `restoreInto`에 최대 개수(`max`)를 받아, 이미 꽉 찼으면 `false`.
  주제는 `LIMITS.topics`(5), 일정은 `LIMITS.events`(1000).
- **화면**: 되돌리기가 거절되면 토스트로 알림 — 주제 "주제는 5개까지예요", 일정 "되돌리지 못했어요" (`ui/news.ts`, `ui/events.ts`).

## 실패 2 — 저장 공간이 꽉 찼을 때 새 브리핑을 지우고 "성공"

- **근거**: `store.test.ts:149` `expect(store.saveBriefing(briefing(TODAY))).toBe(false)` → `true`.
  `write()`의 재시도가 `briefings.slice(0, -1)`로 마지막(가장 오래된) 브리핑을 지우는데,
  브리핑을 저장할 때는 목록이 `[새 브리핑, ...이전 것들]`이라 이전 것이 없으면 **새 브리핑 자체**가 지워짐.
- **수정**: 브리핑을 저장하는 중이면 첫 번째(저장하려는 것)는 남기고, 지울 이전 브리핑이 없으면 `false`.
- **화면**: `ui/news.ts`는 이미 `saveBriefing`이 `false`면 "저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요"를 띄움.

## 전/후

| | 개인 비서 테스트 | 전체 (`npm test`) | `npm run build` |
| --- | --- | --- | --- |
| 수정 전 | 148 / 150 (2 실패) | — | 통과 |
| 수정 후 | **150 / 150** | **196 / 196** | 통과 |

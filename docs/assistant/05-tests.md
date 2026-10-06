# 05 테스트 — 개인 비서

> 입력: [04-build.md](04-build.md) · 다음 단계: 06 버그 수정

## 테스트 파일 (`tests/assistant/`, vitest)

| 파일 | 무엇을 | 핵심 경계 값 |
| --- | --- | --- |
| `text.test.ts` | 글자 수, 정리, 자르기 | 👨‍👩‍👧 30개 = 30글자(`string.length`로는 240), 맥 한글(NFD) 붙여넣기 |
| `dates.test.ts` | 날짜·시간 검사, 주 계산, 시간대 | 2026-02-30 ✗, 2028-02-29 ✓, 월~일 구역, 서울 15:00 = 06:00Z, 뉴욕 서머타임 |
| `rules.test.ts` | 03-data.md의 검증 규칙과 문구 | 주제 30/31글자, 6번째 주제, 제목 50/51, 끝 ≤ 시작, 1001번째 일정, 브리핑 30/31일 |
| `store.test.ts` | localStorage 읽기/쓰기 | 깨진 JSON 보관, 사생활 보호 모드, 저장 공간 가득 참, 수정 시 id·createdAt 유지, 되돌리기 5초 |
| `ics.test.ts` | 캘린더 파일 | UTC 변환, 종일 일정, 특수문자, **75바이트 줄 접기에서 한글·이모지가 안 잘림** |
| `validate.test.ts` | Claude 응답 검사 | 지어낸 링크·http·중복 출처 제거, 없는 날짜 비우기, 초안 2개가 아니면 실패, 깨진 JSON |
| `ai.test.ts` | Claude 호출 (진짜 SDK + 가짜 네트워크) | 요청 모양, `pause_turn` 이어 받기, 무한 반복 방지, 거절, 401/429/네트워크 오류, 취소 |

진짜 API는 부르지 않습니다. `ai.test.ts`는 `fetch`만 가짜로 바꾸고 SDK는 그대로 씁니다.

## 실행 결과 (고치기 전)

```
npx vitest run tests/assistant
 ❯ tests/assistant/store.test.ts (20 tests | 2 failed)
   × undo cannot push past 5 topics (delete one, add another, then 되돌리기)
   × never reports success after dropping the briefing it was asked to save
 Test Files  1 failed | 6 passed (7)
      Tests  2 failed | 148 passed (150)
```

처음 147개는 모두 통과했습니다. 코드를 다시 읽다가 의심 가는 곳 두 군데를 테스트로 만들자 둘 다 실패했습니다.

### 실패 1 — 되돌리기로 주제가 6개가 됨
```
FAIL  store.test.ts > topics > undo cannot push past 5 topics
AssertionError: expected true to be false
  expect(store.restoreTopic(removed)).toBe(false);
```
주제 5개 중 하나를 지우고(4개) → 새 주제를 추가하고(5개) → 5초 안에 **되돌리기**를 누르면 6개가 됩니다. "주제는 5개까지" 규칙이 깨집니다.

### 실패 2 — 저장 공간이 꽉 찼을 때 새 브리핑을 지우고 "성공"이라고 함
```
FAIL  store.test.ts > briefings > never reports success after dropping the briefing it was asked to save
AssertionError: expected true to be false
  expect(store.saveBriefing(briefing(TODAY))).toBe(false);
```
저장 실패 시 "가장 오래된 브리핑을 지우고 다시 시도"하는데, 저장하려던 브리핑이 목록의 유일한 항목이면 **그 브리핑 자체**를 지우고 빈 목록을 저장한 뒤 성공을 돌려줍니다. 화면에는 저장 실패 문구가 안 뜨고 브리핑은 사라집니다.

## 테스트가 정말 잡는지 확인 (일부러 깨뜨리기)

| 일부러 바꾼 코드 | 실패한 테스트 |
| --- | --- |
| 글자 수를 `string.length`로 셈 | 7개 늘어남 (이모지·NFD·경계 값) |
| `.ics` 줄 접기를 바이트 대신 UTF-16 단위로 셈 | 2개 늘어남 (75바이트 초과) |
| 출처가 검색 결과에 있는지 확인하는 부분을 지움 | 2개 늘어남 (지어낸 링크 통과) |

세 경우 모두 테스트가 잡았고, 확인 후 코드는 원래대로 돌렸습니다.

## 브라우저 테스트 (선택)
4단계에서 Playwright로 390px 화면 22개 항목을 이미 눌러 봤습니다 ([04-build.md](04-build.md)). 7단계 점검 때 한 번 더 돌립니다.

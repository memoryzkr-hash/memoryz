# 04 구현 — 개인 비서

> 입력: [01-scope.md](01-scope.md), [02-screens.md](02-screens.md), [03-data.md](03-data.md) · 다음 단계: 05 테스트

## 만든 파일

```
assistant.html              페이지 (vite.config.ts input에 추가 → /memoryz/assistant.html)
src/assistant/core/         순수 로직 — DOM, 네트워크 없음 (05단계 테스트 대상)
  text.ts                     글자 수(Intl.Segmenter), 한 줄/여러 줄 정리, 중복 비교 키
  dates.ts                    날짜·시간 검사, 주(월~일) 구역, 시간대 → UTC 변환
  types.ts                    03-data.md의 데이터 모양
  rules.ts                    검증 규칙·오류 문구·제한값(LIMITS)
  store.ts                    localStorage 읽기/쓰기, 깨진 데이터 보관, 되돌리기(UndoSlot)
  ics.ts                      캘린더 파일 만들기, 75바이트 줄 접기, 파일 이름
  validate.ts                 Claude 응답 검사 (지어낸 출처 버리기, 잘못된 날짜 비우기)
src/assistant/prompts.ts    Claude에게 보내는 지시문과 JSON 스키마
src/assistant/ai.ts         Claude 호출은 전부 여기 (테스트에서 가짜로 바꿀 곳)
src/assistant/ui/           화면: start(S0) news(S1) events(S2) messages(S3) settings(S4), dom 도우미
src/assistant/main.ts       위쪽 바, 탭 바, 화면 전환
```

## 구현하면서 정한 것

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 브리핑 결과 받기 | `submit_briefing` 도구(`strict: true`)로 받음 | structured outputs(`output_config.format`)는 인용(citations)과 같이 쓰면 400 오류. 웹 검색 결과에는 인용이 붙으므로 도구 방식이 안전 |
| 일정 해석·메시지 초안 | structured outputs(JSON 스키마), effort `low` | 웹 검색이 없는 짧은 작업이라 JSON 보장 + 비용 절약 |
| 키 확인 | `models.retrieve('claude-opus-5-5')` | 토큰을 쓰지 않고 키가 맞는지만 확인 |
| 거절 대비 | `fallbacks: "default"` (베타 `server-side-fallback-2026-07-01`) | Claude가 요청을 거절하면 같은 호출 안에서 다른 모델로 다시 시도 |
| 검색이 길어질 때 | `pause_turn`이면 최대 3번 이어서 요청 | 서버 쪽 검색 반복이 10번을 넘으면 멈추기 때문 |
| 브리핑 동시 요청 | 주제 2개씩 | 02단계의 "끝나는 주제부터 하나씩 보이기" |
| 키·인터넷 오류 | 남은 주제를 모두 멈추고 오류 띠 하나만 표시 | 같은 이유로 모든 주제가 실패하기 때문 |
| 설정 화면 | 탭 바를 숨긴 화면, 오른쪽 위 **완료**로 돌아감 | 02단계 S4 |

## 확인한 것 (가짜 Claude 응답 + 실제 브라우저, 390×844)

`npm run typecheck` · `npm run build` · 기존 `npm test`(46개) 통과. 브라우저에서 아래 22개를 눌러 확인:

- 키 형식 오류 문구 → 올바른 키로 시작
- 주제 0개 빈 화면, 예시 칩으로 추가, `ai  도구` 중복 거절, 👨‍👩‍👧 30개 = `30/30`
- 브리핑: 주제 3개 카드, **지어낸 출처 링크가 빠짐**, `[EN]` 표시, 새로고침 후 유지
- 일정: 예시 문장 → 확인 카드 `2026-10-13` / `15:00`, 끝 시간이 빠르면 오류 + 저장 비활성, 16:00으로 고쳐 저장 → 목록 반영, 직접 입력(종일), 새로고침 후 유지
- 공유: `민수-미팅-2026-10-13.ics` 다운로드, `DTSTART:20261013T070000Z`(한국 16:00), `LOCATION:강남역`
- 메시지: 일정에서 넘어오면 일정 띠 표시, 초안 2개, 복사 → 클립보드, 요청에 일정 정보(강남역, 16:00) 포함, 탭을 옮겨도 초안 유지
- 키가 틀리면(401) 브리핑 오류 띠 + 이전 브리핑은 그대로
- 요청 모양: 모델 `claude-opus-5-5`, 웹 검색 `web_search_20260209`, `max_uses` 3, 브라우저 직접 호출 헤더

## 실행해 보지 못한 것 ⚠

진짜 API 키가 없어서 아래는 **확인하지 못했습니다.** 직접 키를 넣고 확인해 주세요.

- [ ] 실제 Claude가 웹 검색 후 `submit_briefing`을 잘 부르는지, 요약 품질, 1분 안에 끝나는지
- [ ] 실제 검색 결과 주소와 Claude가 적은 출처 주소가 잘 맞는지 (안 맞으면 "출처를 확인하지 못했어요"가 자주 뜸)
- [ ] `fallbacks` + structured outputs 조합이 실제 API에서 오류 없이 되는지
- [ ] `pause_turn`이 실제로 올 때 이어 받기
- [ ] 실제 Claude가 "다음 주 화요일" 같은 상대 날짜를 규칙대로 계산하는지
- [ ] 아이폰 사파리 / 안드로이드 크롬에서 복사 버튼, `.ics` 파일 열기
- [ ] 사생활 보호 모드(저장 불가)에서의 문구

참고: 이 컨테이너의 브라우저는 문자 설정 때문에 한글 다운로드 파일 이름이 `download`로 바뀌었는데, UTF-8 설정에서는 정상이었습니다 (실제 휴대폰은 UTF-8).

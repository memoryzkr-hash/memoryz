# 07 출시 점검 — 개인 비서

> 대상: GitHub Pages `https://memoryzkr-hash.github.io/memoryz/assistant.html` · 다음 단계: 08 문서화
> 빌드 결과물(`dist/`)을 로컬에서 `/memoryz/` 하위 경로로 띄워 확인했습니다 (실제 Pages와 같은 경로 구조).

## 체크리스트

| # | 항목 | 결과 | 어떻게 확인했나 |
| --- | --- | --- | --- |
| 1 | 빌드에 `assistant.html`이 들어감 | ✅ 확인함 | `dist/`에 `index.html`, `ride.html`, `assistant.html` |
| 2 | 파일 경로가 상대 경로 | ✅ 확인함 | `dist/assistant.html`의 스크립트·CSS가 모두 `./assets/…` (vite `base: './'`) |
| 3 | `/memoryz/` 하위 경로에서 동작 | ✅ 확인함 | `http://localhost:8765/memoryz/assistant.html`에서 전체 흐름 22개 통과 |
| 4 | 저장소·빌드에 API 키 없음 | ✅ 확인함 | 추적 중인 파일과 `dist/`에서 `sk-ant-api..-…`/`sk-ant-admin..-…` 모양 검색 → 0건 |
| 5 | API 키가 없을 때 | ✅ 확인함 | 처음 열면 시작 화면(S0), 다른 화면으로 못 감 |
| 6 | API 키가 틀릴 때 | ✅ 확인함 | 시작 화면: 형식 오류 문구 / 브리핑 중 401: "API 키가 맞지 않아요 [설정에서 바꾸기]", 이전 브리핑 유지 |
| 7 | localStorage를 못 쓸 때 (사생활 보호 모드) | ✅ 확인함 | `localStorage` 접근이 항상 예외를 내게 만든 브라우저에서 "이 브라우저에서는 저장할 수 없어요. 일반 창에서 열어 주세요", 페이지 오류 0 |
| 8 | 저장 공간이 꽉 찰 때 | ✅ 확인함 | 단위 테스트: 오래된 브리핑을 지우고 1번 재시도, 안 되면 실패 문구 (6단계에서 고친 부분) |
| 9 | 저장 데이터가 깨졌을 때 | ✅ 확인함 | 단위 테스트: 빈 값으로 시작, 원본은 `<키>.corrupt`에 보관, 화면에 안내 띠 |
| 10 | 390px 화면 | ✅ 확인함 | 시작·소식(주제 5개)·일정 편집(50자 제목, 긴 장소)·일정 목록·메시지·설정에서 가로 스크롤 없음 |
| 11 | 다크 모드 | ✅ 확인함 | `prefers-color-scheme: dark` 화면 캡처 확인 |
| 12 | 브라우저에서 Claude API 직접 호출 (CORS) | ✅ 확인함 | 키 없이 `api.anthropic.com`에 Origin `https://memoryzkr-hash.github.io`로 preflight → 200, 필요한 헤더(`anthropic-beta`, `anthropic-dangerous-direct-browser-access`, `x-api-key` 등) 모두 허용, `access-control-allow-origin: *` |
| 13 | AI·사용자 글로 HTML 주입 불가 | ✅ 확인함 | `src/assistant`에 `innerHTML`/`eval` 없음 (모든 글은 `textContent`) |
| 14 | 이상한 링크 차단 | ✅ 확인함 | 출처는 `https://`이면서 이번 검색 결과에 나온 주소만 표시 (`javascript:`·`data:`·지어낸 링크 테스트), 새 탭 링크는 모두 `rel="noopener noreferrer"` |
| 15 | CI가 새 테스트를 돌림 | ✅ 확인함 | `.github/workflows/ci.yml`이 `npm test` → `tests/assistant/` 포함 (Node 22, `Intl.Segmenter` 지원) |
| 16 | 실제 배포 | ⚠ 확인 못 함 | Pages는 **기본 브랜치**에 push될 때만 배포됨. 이 브랜치를 합쳐야 주소가 열림 |
| 17 | 진짜 Claude 응답 (요약 품질, 시간, 출처 일치, 날짜 계산) | ⚠ 확인 못 함 | 진짜 API 키가 필요. [04-build.md](04-build.md)의 "실행해 보지 못한 것" 체크리스트 |
| 18 | 아이폰 사파리 / 안드로이드에서 복사·`.ics` 열기 | ⚠ 확인 못 함 | 실제 휴대폰 필요 (데스크톱 Chromium에서는 통과) |

## 알려진 한계 (출시해도 되지만 알고 있어야 할 것)
- API 키가 브라우저 `localStorage`에 **암호화 없이** 저장됩니다. 같은 브라우저를 쓰는 사람은 볼 수 있습니다 → 개인 기기에서만 쓰고, 콘솔에서 월 사용 한도를 거세요.
- 브라우저 데이터를 지우면 주제·브리핑·일정이 모두 사라집니다 (백업·동기화 없음).
- 앱이 열려 있을 때만 동작합니다 (자동 브리핑·알림 없음).

## 판단
코드 쪽 문제는 없습니다. **배포 가능**합니다. 남은 확인(16~18)은 배포 후 진짜 키와 휴대폰으로 해야 합니다.

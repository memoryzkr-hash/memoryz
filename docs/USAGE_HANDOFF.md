# 클로드 사용량 — 로컬 개발 인수인계

클라우드 세션에서 만든 "클로드 사용량" 페이지를 내 맥에서 이어서 개발하기 위한 메모입니다.
기획은 [USAGE_PLAN.md](USAGE_PLAN.md), 사용법은 [tools/claude-usage/README.md](../tools/claude-usage/README.md).

## 받기

```bash
git clone -b claude/busy-ride-ao5cgk https://github.com/memoryzkr-hash/memoryz.git
cd memoryz
npm install
```

## 개발 명령

```bash
npm run dev            # http://localhost:5173/usage.html  (브라우저 저장소 사용)
npm test               # 전체 테스트 (사용량: tests/usage/core.test.ts)
npm run typecheck
npm run build:usage    # local/claude-usage/ 다시 만들기 (index.html + 스크립트 + 안내)
node scripts/build-usage-artifact.mjs out.html   # claude.ai 아티팩트용 한 파일
```

## 파일 지도

| 파일 | 내용 |
| --- | --- |
| `src/usage/core.ts` | 순수 계산. 주간 롤오버, 진행률·예상치·상태, 추천(남은 % ÷ 남은 시간), 결제일, 붙여넣기/배치 파싱, 계정 이름 매칭, 시간 표시 |
| `src/usage/main.ts` | 화면. 계정 카드(주간·5시간 게이지 + 기간), 추가/편집 시트, 사용량 불러오기, 맥 설정 안내, 로컬 모드(`usage-data.js` 읽기) |
| `src/usage/store.ts` | 저장. 아티팩트로 열리면 claude.ai db, 그 밖엔 localStorage |
| `src/usage/usage.css` | 토스 스타일 디자인 토큰(라이트/다크) |
| `src/usage/bookmarklet.ts` | claude.ai에서 쓰는 북마클릿(실험적) |
| `tools/claude-usage/claude-usage` | 맥 조회 스크립트(zsh). 토큰은 키체인, 결과는 클립보드 + `usage-data.js` |
| `tools/claude-usage/install.sh`, `README.md` | 설치 스크립트, 로컬 사용 안내 |
| `local/claude-usage/` | 배포용 완성 폴더(생성물, 직접 수정 금지) |
| `scripts/build-usage-artifact.mjs` | 한 파일 HTML 빌드(아티팩트 / `--local`) |
| `scripts/fetch-claude-usage.mjs` | 환경 변수 `CLAUDE_USAGE_TOKEN_<이름>`으로 조회(클라우드 세션용) |
| `src/assistant/ui/dom.ts` | 공용 DOM 헬퍼(`h`, `openSheet`, `toast`) — 개인 비서 페이지와 공유 |

## 데이터 흐름

1. `claude-usage add <이름>` → `claude setup-token`으로 받은 토큰을 키체인(서비스 `claude-usage`)에 저장
2. `claude-usage` → `GET https://api.anthropic.com/api/oauth/usage`
   (헤더 `Authorization: Bearer <토큰>`, `anthropic-beta: oauth-2025-04-20`)
   → 응답 `{five_hour:{utilization,resets_at}, seven_day:{…}, …}`
3. 배치 JSON `{source:"claude-usage", fetchedAt, accounts:[{name, usage}|{name, error}]}`을
   클립보드 + `~/.config/claude-usage/last.json` + (폴더에 index.html이 있으면) `usage-data.js`로 저장
4. 페이지가 `parseUsageBatch` → `matchAccount`(이름의 글자·숫자만 비교, 이메일 앞부분도) → `applyImport`(fetchedAt으로 기록)

## 결정해 둔 것

- 아이디·비밀번호는 받지 않는다(클로드 계정엔 비밀번호가 없고, 수집은 위험). 토큰도 페이지·대화에 적지 않는다.
- 아티팩트 페이지는 CSP 때문에 api.anthropic.com을 직접 부를 수 없다 → 조회는 맥 스크립트(또는 클라우드 세션 환경 변수)가 한다.
- 계정 번호("계정 1, 2")는 등록 순서(createdAt).

## 아직 확인 못 한 것 / 다음 할 일

- [ ] **실제 맥 + 실제 토큰으로 첫 실행.** `setup-token` 토큰에 사용량 조회 권한이 있는지 미확인.
      `claude-usage add`가 403이면 Claude Code 로그인 정보(키체인 `Claude Code-credentials`)를 읽는 방식으로 바꿔야 함.
- [ ] 북마클릿은 실제 claude.ai에서 시험 안 함.
- [ ] 모델별 주간 한도(`seven_day_opus` 등) 게이지 추가.
- [ ] 사용량 기록 히스토리 → 주간 추세 그래프.
- 테스트는 리눅스에서 macOS 명령(security·osascript·pbcopy·date -r)을 흉내 내 돌렸음. 실제 macOS에서 `date`, `osascript -l JavaScript` 동작 확인 필요.

## 배포된 것

- claude.ai 아티팩트(본인만): https://claude.ai/artifact/BtzsNmfJt8y9CEoTTFNYL6 — 클라우드 db에 계정 2개(quaternary2026, memoryz.kr) 등록됨.
  다시 배포하려면 아티팩트 빌드 결과를 같은 링크로 올려야 함(클로드 세션에서 "아티팩트 업데이트해줘").

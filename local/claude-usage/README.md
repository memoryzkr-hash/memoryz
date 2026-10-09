# 클로드 사용량 — 맥에서 로컬로 쓰기

여러 클로드 계정의 **주간 한도·5시간 세션 사용량과 초기화 시각**을 내 맥에서 조회하고,
같은 폴더의 `index.html` 페이지에서 계정별 게이지로 보는 도구입니다.
서버도, 설치할 프로그램(Node 등)도 필요 없습니다.

## 폴더 구성

| 파일 | 하는 일 |
| --- | --- |
| `index.html` | 사용량 페이지. 더블클릭하면 브라우저에서 열려요. 계정 목록은 그 브라우저에 저장돼요. |
| `claude-usage` | 조회 스크립트(zsh). 모든 계정의 사용량을 가져와 `usage-data.js`로 저장하고 클립보드에도 복사해요. |
| `install.sh` | `claude-usage`를 터미널 어디서나 쓸 수 있게 연결해요. |
| `usage-data.js` | 조회할 때마다 스크립트가 새로 써요. 페이지가 이 파일을 읽어 자동으로 반영해요. (처음엔 없어요) |

## 준비물

- macOS
- [Claude Code](https://code.claude.com) — 터미널에서 `claude --version`이 나오면 OK.
  계정별 토큰을 만드는 `claude setup-token`에 필요해요.

## 처음 한 번

1. **폴더 두기**: 이 폴더를 원하는 곳(예: `문서/claude-usage`)에 둡니다. 옮기면 3번을 다시 해요.
2. **터미널 열기**: Finder에서 이 폴더를 우클릭 → **폴더에서 새로운 터미널 열기**.
   (메뉴가 없으면 터미널에 `cd ` 를 치고 폴더를 끌어다 놓은 뒤 Enter)
3. **설치**
   ```bash
   zsh install.sh
   ```
   끝나면 **터미널 창을 새로 열어** 주세요.
4. **계정 연결** — 계정마다 한 번씩:
   ```bash
   claude-usage add quaternary2026
   claude-usage add memoryz.kr
   ```
   - 먼저 브라우저의 claude.ai에 **그 계정으로** 로그인돼 있는지 확인하세요.
   - "claude setup-token 을 실행할까요?"에 Enter → 브라우저에서 승인 → 터미널에 나온 `sk-ant-oat01-…` 토큰을 복사
   - "토큰을 붙여 넣고 Enter"에 붙여 넣기(화면엔 안 보여요) → `✓ 등록 완료`
   - 이름은 페이지의 계정 이름과 같게 적으면 자동으로 연결돼요.

## 매일 쓰기

```bash
claude-usage open     # 모든 계정 조회 → 사용량 페이지 열기
```

- 페이지가 이미 열려 있으면 `claude-usage`만 실행해도 1분 안에(또는 페이지로 돌아올 때) 자동으로 최신 값이 돼요.
  페이지 아래 **사용량 불러오기** 버튼을 누르면 바로 읽어요.
- 터미널에도 계정별 게이지가 나와요.

### 자동 조회 (선택)

```bash
claude-usage schedule on    # 1시간마다 조회 + 알림 (곧 초기화되는데 30% 넘게 남음 / 주간 90% 이상)
claude-usage schedule off   # 끄기
```

### 그 밖의 명령

```bash
claude-usage list            # 등록된 계정
claude-usage remove <이름>   # 계정 삭제(키체인의 토큰도 삭제)
claude-usage copy            # 마지막 결과를 클립보드로 (claude.ai 아티팩트 페이지에 Cmd+V 할 때)
claude-usage help
```

## 보안

- 아이디·비밀번호는 어디에도 입력하지 않아요. 로그인은 각 계정의 브라우저에서 직접 해요.
- 토큰은 **macOS 키체인**(키체인 접근 앱 → `claude-usage`)에만 저장돼요. 파일에는 계정 이름만 적혀요(`~/.config/claude-usage/accounts`).
- `usage-data.js`에는 사용량 숫자만 들어 있어요. 토큰은 없어요.

## 문제가 생기면

| 메시지 | 해결 |
| --- | --- |
| `command not found: claude-usage` | 터미널 창을 새로 열거나 `source ~/.zshrc`. 그래도 안 되면 폴더에서 `zsh install.sh` 다시 실행 |
| `토큰이 만료됐거나 끊겼어요` | `claude-usage add <이름>`으로 다시 등록 |
| `이 토큰으로는 사용량을 볼 수 없어요` | 이 방식이 막힌 경우예요. 메시지를 그대로 알려 주세요 |
| 페이지에 값이 안 바뀜 | `claude-usage open`으로 열었는지 확인(같은 폴더의 index.html이어야 해요) |

> 사용량은 Claude Code의 `/usage`가 쓰는 공개되지 않은 주소(`api.anthropic.com/api/oauth/usage`)에서 읽어요.
> 이 주소가 바뀌면 스크립트를 고쳐야 할 수 있어요.

## 고치는 법 (개발용)

이 폴더는 저장소에서 만들어진 결과물이에요. 원본은 여기 있어요.

- 페이지: `src/usage/` (TypeScript), 조회 스크립트·설치·이 문서: `tools/claude-usage/`
- 다시 만들기: 저장소 루트에서 `npm install && npm run build:usage` → `local/claude-usage/`

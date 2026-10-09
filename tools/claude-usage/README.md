# claude-usage (macOS)

여러 클로드 계정의 사용량(주간 한도·5시간 세션)과 초기화 시각을 명령 한 줄로 조회하는 zsh 스크립트.
결과는 클립보드에 JSON으로 복사되고, [클로드 사용량 페이지](../../usage.html)에서 Cmd+V 하면 이름이 같은 계정에 한 번에 반영됩니다.

## 설치

사용량 페이지의 **맥에서 자동으로 불러오기 → 설치 명령 복사**를 터미널에 붙여 넣거나, 이 저장소에서:

```bash
mkdir -p ~/.local/bin && cp tools/claude-usage/claude-usage ~/.local/bin/ && chmod +x ~/.local/bin/claude-usage
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc   # 처음 한 번
```

## 사용

```bash
claude-usage add quaternary2026   # 계정마다 한 번: claude setup-token → 토큰 붙여넣기
claude-usage add memoryz.kr
claude-usage                      # 모든 계정 조회 + 클립보드 복사
claude-usage schedule on          # (선택) 1시간마다 조회, 곧 초기화·90% 이상이면 알림
claude-usage list | remove <이름> | copy | help
```

- 필요한 것: macOS, [Claude Code](https://code.claude.com) (`claude setup-token`). 그 밖의 설치는 없습니다(curl·security·osascript는 macOS 기본).
- 토큰은 macOS 키체인(서비스 `claude-usage`)에만 저장되고, `~/.config/claude-usage/accounts`에는 계정 이름만 적힙니다.
- 사용량은 Claude Code의 `/usage`가 쓰는 공개되지 않은 주소(`api.anthropic.com/api/oauth/usage`)에서 읽습니다. 바뀌거나 토큰에 권한이 없으면 `add` 단계에서 이유와 함께 실패합니다.

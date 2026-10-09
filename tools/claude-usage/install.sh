#!/bin/zsh
# 이 폴더의 claude-usage를 터미널 어디서나 쓸 수 있게 연결합니다. 폴더를 옮기면 다시 실행하세요.
set -e
DIR=${0:A:h}
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true
chmod +x "$DIR/claude-usage"
mkdir -p "$HOME/.local/bin"
ln -sf "$DIR/claude-usage" "$HOME/.local/bin/claude-usage"
if ! grep -qs '.local/bin' "$HOME/.zshrc"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
fi
echo "✓ 설치했어요: $HOME/.local/bin/claude-usage → $DIR/claude-usage"
echo
echo "새 터미널 창을 연 뒤 계정마다 한 번씩:"
echo "  claude-usage add 계정이름"
echo "그다음:"
echo "  claude-usage open"

#!/bin/bash
# macOS: 이 파일을 더블클릭하면 시간표 앱을 켭니다.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 없어요. https://nodejs.org 에서 LTS(22 이상)를 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫혀요" _
  exit 1
fi
[ -d node_modules ] || npm install
npm run dev -- --web

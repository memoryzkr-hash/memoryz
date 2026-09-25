#!/bin/bash
# 맥: 이 파일을 더블클릭하면 단톡방 서버가 켜지고 브라우저가 열립니다.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫힙니다." _
  exit 1
fi
[ -d node_modules ] || npm install
[ -f .env ] || cp .env.example .env
PORT="${PORT:-8787}"
(sleep 3; open "http://localhost:$PORT") &
npm start

@echo off
REM Windows: 이 파일을 더블클릭하면 시간표 앱을 켭니다.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js가 없어요. https://nodejs.org 에서 LTS^(22 이상^)를 설치한 뒤 다시 실행해 주세요. & pause & exit /b 1)
if not exist node_modules call npm install
call npm run dev -- --web
pause

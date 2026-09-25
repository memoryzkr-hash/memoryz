@echo off
chcp 65001 >nul
rem 윈도우: 이 파일을 더블클릭하면 단톡방 서버가 켜지고 브라우저가 열립니다.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist .env copy .env.example .env >nul
if "%PORT%"=="" set PORT=8787
start "" cmd /c "timeout /t 3 >nul && start http://localhost:%PORT%"
call npm start
pause

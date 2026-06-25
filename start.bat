@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치 후 다시 실행해주세요.
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules" (
    echo 의존성을 설치합니다...
    call npm install
    if errorlevel 1 (
        echo npm install에 실패했습니다.
        pause
        exit /b 1
    )
)

echo 개발 서버를 시작합니다... 브라우저가 자동으로 열립니다.
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5173"
call npm run dev

pause

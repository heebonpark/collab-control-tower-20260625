@echo off
chcp 65001 >nul
setlocal

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo Please install it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies, this may take a minute...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See the messages above.
        pause
        exit /b 1
    )
)

echo Starting dev server... your browser will open automatically once it's ready.
call npm run dev
if errorlevel 1 (
    echo [ERROR] npm run dev exited with an error. See the messages above.
)

echo.
echo Press any key to close this window.
pause >nul

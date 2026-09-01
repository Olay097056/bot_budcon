@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo ! Node: MISSING & exit /b 1)
echo * Node: OK
call npm install --silent >nul 2>&1
echo * deps: OK
if not exist "node_modules\playwright\package.json" call npx playwright install firefox >nul 2>&1
echo * playwright: OK
start "" http://localhost:7890
echo * open: http://localhost:7890
set BOT_BUDCON_LOGIN_DRIVER=invisible
set BOT_BUDCON_HEADLESS=0
npx tsx src/server.ts

@echo off
setlocal
cd /d "%~dp0"

REM === 0. kill node ค้างจาก run ก่อนหน้า ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-cleanup.ps1"
echo * cleanup: OK

REM === 1. node + deps + playwright ===
where node >nul 2>&1 || (echo ! Node: MISSING & exit /b 1)
echo * Node: OK
call npm install --silent >nul 2>&1
echo * deps: OK
if not exist "node_modules\playwright\package.json" call npx playwright install firefox >nul 2>&1
echo * playwright: OK

REM === 2. port 7890 ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-port-check.ps1"

REM === 3. start server ===
set BOT_BUDCON_LOGIN_DRIVER=invisible
set BOT_BUDCON_HEADLESS=0
start "bot_budcon-server" /min cmd /c "npx tsx src/server.ts"
echo * server starting...

REM === 4. wait server ready (max 30s) ===
set /a i=0
:wait_loop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-wait-server.ps1" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo * server: ready
  goto ready
)
set /a i+=1
if %i% GTR 30 (
  echo ! server: TIMEOUT after 30s
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
REM === 5. open browser ===
start "" http://localhost:7890
echo * open: http://localhost:7890
echo.
echo === run_here.bat DONE ===
echo === Login: ทำ captcha ใน Firefox ที่เด้ง ===
echo === Stop: ปิด window "bot_budcon-server" หรือ taskkill /IM node.exe ===

@echo off
setlocal
cd /d "%~dp0"

REM === anti-double-run lock (กันคลิกรัวจน browser เด้งซ้ำ) ===
if exist "%TEMP%\bot_budcon.lock" (
  echo * พบว่ากำลังรันอยู่แล้ว — เปิดหน้าเว็บให้เฉยๆ
  start "" http://localhost:7890
  exit /b 0
)
echo run>%TEMP%\bot_budcon.lock

REM === 0. kill node/firefox ค้าง + ล้าง lock ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-cleanup.ps1"
echo * cleanup: OK

REM === 1. node + deps + playwright ===
where node >nul 2>&1 || (echo ! Node: MISSING & del "%TEMP%\bot_budcon.lock" & exit /b 1)
echo * Node: OK
call npm install --silent >nul 2>&1
echo * deps: OK
if not exist "node_modules\playwright\package.json" call npx playwright install firefox >nul 2>&1
echo * playwright: OK

REM === 2. port 7890 ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-port-check.ps1"

REM === 3. start server (login ผ่าน Firefox จริงของ user — invisible engine โดน Akamai deny) ===
set BOT_BUDCON_LOGIN_DRIVER=playwright
set BOT_BUDCON_HEADLESS=0
start "bot_budcon-server" /min cmd /c "npx tsx src/server.ts"
echo * server starting...

REM === 4. wait server ready (max 45s) ===
set /a i=0
:wait_loop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_run-wait-server.ps1" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo * server: ready
  goto ready
)
set /a i+=1
if %i% GTR 45 (
  echo ! server: TIMEOUT 45s — ดู server-log.txt
  del "%TEMP%\bot_budcon.lock"
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
REM === 5. เปิด browser ครั้งเดียว ===
start "" http://localhost:7890
del "%TEMP%\bot_budcon.lock"
echo * open: http://localhost:7890
echo.
echo === เสร็จ — server ทำงานอยู่เบื้องหลัง (window: bot_budcon-server) ===
echo === หยุด: ปิด window bot_budcon-server หรือ taskkill /IM node.exe ===

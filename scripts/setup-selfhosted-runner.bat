@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo === bot_budcon self-hosted runner setup ===
echo.

where gh >nul 2>&1 || (echo ! gh CLI not found - install from https://cli.github.com & pause & exit /b 1)
gh auth status >nul 2>&1 || (echo ! gh not logged in - run: gh auth login & pause & exit /b 1)
echo * gh CLI: OK (logged in)

set RUNNER_DIR=%~dp0runner
if exist "%RUNNER_DIR%\config.cmd" (
  echo * runner already configured at %RUNNER_DIR%
  echo   Start it with: %RUNNER_DIR%\run.cmd
  pause
  exit /b 0
)

REM ticket 21 - fetch registration token automatically (1h expiry, no web UI)
echo * fetching runner registration token from GitHub...
for /f "usebackq delims=" %%T in (`gh api -X POST repos/Olay097056/bot_budcon/actions/runners/registration-token --jq ".token"`) do set GH_TOKEN=%%T
if "%GH_TOKEN%"=="" (echo ! could not fetch token - check repo access & pause & exit /b 1)
echo * token: OK ^(expires in 1h^)

set GH_URL=https://github.com/Olay097056/bot_budcon
set /p RUNNER_NAME="Runner name [budcon-home]: "
if "%RUNNER_NAME%"=="" set RUNNER_NAME=budcon-home
set /p RUNNER_LABELS="Labels [self-hosted,windows,budcon]: "
if "%RUNNER_LABELS%"=="" set RUNNER_LABELS=self-hosted,windows,budcon

echo.
echo * Downloading runner...
mkdir "%RUNNER_DIR%" 2>nul
cd /d "%RUNNER_DIR%"
if not exist config.cmd (
  powershell -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri https://github.com/actions/runner/releases/latest/download/actions-runner-win-x64-2.321.0.zip -OutFile runner.zip"
  if errorlevel 1 (echo ! download failed & pause & exit /b 1)
  powershell -Command "Expand-Archive -Force runner.zip -DestinationPath ."
  del runner.zip
)
echo * runner binary: OK

echo * Configuring...
call config.cmd --url "%GH_URL%" --token "%GH_TOKEN%" --name "%RUNNER_NAME%" --labels "%RUNNER_LABELS%" --unattended --replace
if errorlevel 1 (echo ! config failed - token may have expired, re-run & pause & exit /b 1)

echo.
echo * Done. Starting runner...
echo   Keep this window open. Ctrl+C to stop.
echo   Install as service (survives reboot, admin PowerShell^):
echo     %RUNNER_DIR%\config.cmd --url %GH_URL% --token %GH_TOKEN% --unattended --runAsService
echo.
call run.cmd

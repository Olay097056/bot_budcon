@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo === bot_budcon self-hosted runner setup (Windows) ===
echo.

where git >nul 2>&1 || (echo ! git not found & pause & exit /b 1)
where node >nul 2>&1 || (echo ! node not found & pause & exit /b 1)

set RUNNER_DIR=%~dp0runner
if exist "%RUNNER_DIR%\config.cmd" (
  echo * runner already configured at %RUNNER_DIR%
  echo   Run: %RUNNER_DIR%\run.cmd
  pause
  exit /b 0
)

echo 1) Go to: https://github.com/Olay097056/bot_budcon/settings/actions/runners/new
echo    - Runner image: Windows / x64
echo    - Copy the token (starts with A...)
echo.
set /p GH_URL="GitHub repo URL [https://github.com/Olay097056/bot_budcon]: "
if "%GH_URL%"=="" set GH_URL=https://github.com/Olay097056/bot_budcon
set /p GH_TOKEN="Paste runner token: "
if "%GH_TOKEN%"=="" (echo ! token required & pause & exit /b 1)

set /p RUNNER_NAME="Runner name [budcon-home]: "
if "%RUNNER_NAME%"=="" set RUNNER_NAME=budcon-home
set /p RUNNER_LABELS="Labels [self-hosted,windows,budcon]: "
if "%RUNNER_LABELS%"=="" set RUNNER_LABELS=self-hosted,windows,budcon

echo.
echo * Downloading runner...
mkdir "%RUNNER_DIR%" 2>nul
cd /d "%RUNNER_DIR%"
powershell -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri https://github.com/actions/runner/releases/latest/download/actions-runner-win-x64-2.321.0.zip -OutFile runner.zip"
if errorlevel 1 (echo ! download failed & pause & exit /b 1)
powershell -Command "Expand-Archive -Force runner.zip -DestinationPath ."
del runner.zip

echo * Configuring...
call config.cmd --url "%GH_URL%" --token "%GH_TOKEN%" --name "%RUNNER_NAME%" --labels "%RUNNER_LABELS%" --unattended --replace
if errorlevel 1 (echo ! config failed & pause & exit /b 1)

echo.
echo * Done. Starting runner...
echo   Keep this window open. Press Ctrl+C to stop.
echo   Or install as service: runas admin ^> %RUNNER_DIR%\config.cmd --url ... --runAsService
echo.
call run.cmd

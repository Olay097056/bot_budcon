<#
.SYNOPSIS
  Setup GitHub self-hosted runner for bot_budcon (free Akamai bypass via home IP)
.DESCRIPTION
  Downloads the runner, configures it, and starts it. Keep the window open.
  Alternative to .bat — same flow, with better error messages.
#>
param(
  [string]$RepoUrl = "https://github.com/Olay097056/bot_budcon",
  [string]$Token = "",
  [string]$RunnerName = "budcon-home",
  [string]$Labels = "self-hosted,windows,budcon"
)
$ErrorActionPreference = "Stop"
$runnerDir = Join-Path $PSScriptRoot "runner"
if (Test-Path (Join-Path $runnerDir "config.cmd")) {
  Write-Host "* runner already configured at $runnerDir" -ForegroundColor Green
  Write-Host "  Run: $runnerDir\run.cmd"
  exit 0
}
if (-not $Token) {
  Write-Host "1) Open: $RepoUrl/settings/actions/runners/new" -ForegroundColor Cyan
  Write-Host "   Copy the token (A...)"
  $Token = Read-Host "Paste runner token"
  if (-not $Token) { throw "token required" }
}
if (-not (Get-Command git -EA SilentlyContinue)) { throw "git not found" }
if (-not (Get-Command node -EA SilentlyContinue)) { throw "node not found" }

New-Item -ItemType Directory -Force -Path $runnerDir | Out-Null
Push-Location $runnerDir
try {
  Write-Host "* Downloading runner..." -ForegroundColor Yellow
  $zip = Join-Path $runnerDir "runner.zip"
  Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/latest/download/actions-runner-win-x64-2.321.0.zip" -OutFile $zip
  Expand-Archive -Force $zip -DestinationPath $runnerDir
  Remove-Item $zip -Force

  Write-Host "* Configuring..." -ForegroundColor Yellow
  & .\config.cmd --url $RepoUrl --token $Token --name $RunnerName --labels $Labels --unattended --replace
  if ($LASTEXITCODE -ne 0) { throw "config.cmd failed ($LASTEXITCODE)" }

  Write-Host "* Done. Starting runner (Ctrl+C to stop)..." -ForegroundColor Green
  Write-Host "  To run as service (admin): .\config.cmd --url $RepoUrl --runAsService"
  & .\run.cmd
} finally { Pop-Location }

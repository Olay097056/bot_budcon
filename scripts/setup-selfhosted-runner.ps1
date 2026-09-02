<#
.SYNOPSIS
  Setup GitHub self-hosted runner for bot_budcon — token fetched automatically via gh CLI (ticket 21).
.DESCRIPTION
  No web UI, no token copy-paste: `gh api -X POST .../registration-token` mints the
  1-hour token from the already-logged-in gh session. Downloads, configures, runs.
#>
param(
  [string]$RepoUrl = "https://github.com/Olay097056/bot_budcon",
  [string]$RunnerName = "budcon-home",
  [string]$Labels = "self-hosted,windows,budcon"
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -EA SilentlyContinue)) { throw "gh CLI not found — install from https://cli.github.com" }
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "gh not logged in — run: gh auth login" }
Write-Host "* gh CLI: OK (logged in)" -ForegroundColor Green

$runnerDir = Join-Path $PSScriptRoot "runner"
if (Test-Path (Join-Path $runnerDir "config.cmd")) {
  Write-Host "* runner already configured at $runnerDir" -ForegroundColor Green
  Write-Host "  Run: $runnerDir\run.cmd"
  exit 0
}

# ticket 21 — mint the registration token (1h expiry) without the web UI
Write-Host "* fetching runner registration token..." -ForegroundColor Yellow
$repoParts = $RepoUrl -replace 'https://github\.com/', ''
$reg = gh api -X POST "repos/$repoParts/actions/runners/registration-token" | ConvertFrom-Json
if (-not $reg.token) { throw "could not fetch registration token (repo access?)" }
Write-Host "* token: OK (expires $($reg.expires_at))" -ForegroundColor Green

if (-not (Get-Command git -EA SilentlyContinue)) { throw "git not found" }
if (-not (Get-Command node -EA SilentlyContinue)) { throw "node not found" }

New-Item -ItemType Directory -Force -Path $runnerDir | Out-Null
Push-Location $runnerDir
try {
  if (-not (Test-Path (Join-Path $runnerDir "config.cmd"))) {
    Write-Host "* Downloading runner..." -ForegroundColor Yellow
    $zip = Join-Path $runnerDir "runner.zip"
    Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/latest/download/actions-runner-win-x64-2.321.0.zip" -OutFile $zip
    Expand-Archive -Force $zip -DestinationPath $runnerDir
    Remove-Item $zip -Force
  }
  Write-Host "* runner binary: OK" -ForegroundColor Green

  Write-Host "* Configuring..." -ForegroundColor Yellow
  & .\config.cmd --url $RepoUrl --token $reg.token --name $RunnerName --labels $Labels --unattended --replace
  if ($LASTEXITCODE -ne 0) { throw "config.cmd failed ($LASTEXITCODE) — token expired? re-run" }

  Write-Host "* Done. Starting runner (Ctrl+C to stop)..." -ForegroundColor Green
  Write-Host "  As a service (admin PowerShell): .\config.cmd --url $RepoUrl --token <token> --unattended --runAsService"
  & .\run.cmd
} finally { Pop-Location }

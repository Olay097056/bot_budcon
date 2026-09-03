# kill node ค้างทั้งหมด
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process firefox -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*bot_budcon*' -or $_.Path -like '*ms-playwright*' } | Stop-Process -Force -ErrorAction SilentlyContinue
# remove profile lock
$lock = Join-Path $env:USERPROFILE '.bot-budcon-data\firefox-profile\parent.lock'
if (Test-Path $lock) { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
exit 0

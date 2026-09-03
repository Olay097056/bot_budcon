# ตรวจ port 7890 ถ้ามีคนฟัง ให้ kill
$busy = Test-NetConnection -ComputerName localhost -Port 7890 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($busy) {
  Write-Host "! port 7890 BUSY — killing"
  Get-NetTCPConnection -LocalPort 7890 -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 2
} else {
  Write-Host "* port 7890: free"
}
exit 0

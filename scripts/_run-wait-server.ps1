# wait server ready
try {
  $r = Invoke-WebRequest -Uri http://localhost:7890/api/status -UseBasicParsing -TimeoutSec 2
  if ($r.StatusCode -eq 200) { exit 0 }
} catch {}
exit 1

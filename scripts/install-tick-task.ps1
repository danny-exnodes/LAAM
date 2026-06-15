#requires -Version 5.1
<#
  LAAM - cai Windows Scheduled Task 'LAAM-workflow-tick': POST
  http://localhost:<Port>/api/workflows/tick MOI PHUT kem header
  x-workflow-tick-secret. Idempotent: task da ton tai se bi go va dang ky lai.

  Secret doc tu tham so -Secret, neu khong co thi tu dong WORKFLOW_TICK_SECRET=
  trong .env o repo root - KHONG hardcode trong script. Luu y: gia tri secret
  duoc NHUNG vao dinh nghia task luc cai (admin local doc duoc qua schtasks);
  xoay secret xong phai chay lai script nay.

  Vi du:
    powershell -File scripts\install-tick-task.ps1                # prod :3900
    powershell -File scripts\install-tick-task.ps1 -Port 3100     # dev
    powershell -File scripts\install-tick-task.ps1 -Secret 'xxx'  # secret tay
#>
param(
  [int]$Port = 3900,
  [string]$Secret = '',
  [string]$TaskName = 'LAAM-workflow-tick'
)
$ErrorActionPreference = 'Stop'

# --- Secret: -Secret > .env (WORKFLOW_TICK_SECRET=...) -----------------------
if (-not $Secret) {
  $envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*WORKFLOW_TICK_SECRET\s*=' } | Select-Object -First 1
    if ($line) { $Secret = ($line -split '=', 2)[1].Trim() }
  }
}
if (-not $Secret) {
  # Fail-loud: khi WORKFLOW_TICK_SECRET da set tren app, tick KHONG co fallback
  # localhost -> task khong secret se 401 vinh vien. Khong dang ky task vo dung.
  Write-Host "LOI: khong tim thay secret (-Secret hoac WORKFLOW_TICK_SECRET trong .env)." -ForegroundColor Red
  Write-Host "Dat WORKFLOW_TICK_SECRET trong .env (openssl rand -base64 32) roi chay lai."
  exit 1
}

# --- Dang ky task (go ban cu neu co -> idempotent) ---------------------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Da go task cu '$TaskName'."
}

# Secret nam trong chuoi nhay-don cua lenh con -> escape ' thanh ''.
$escaped = $Secret.Replace("'", "''")
$cmd = "Invoke-RestMethod -Method POST -Uri http://localhost:$Port/api/workflows/tick -Headers @{'x-workflow-tick-secret'='$escaped'} -UseBasicParsing"
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
# -Once + RepetitionInterval 1 phut, khong dat RepetitionDuration -> lap vo han.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
# KHONG bat catch-up cua OS (app tu realign lich bi lo); poke truoc do con chay -> bo qua.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
# LogonType S4U ('Run whether user is logged on or not', KHONG luu mat khau) -> task chay
# o session 0 (non-interactive) => (1) HET nhay cua so terminal moi phut: powershell.exe duoi
# Interactive logon spawn conhost.exe chop len TRUOC khi -WindowStyle Hidden kip an; S4U khong
# co console nen khong bao gio hien; (2) tick van chay khi da log off (localhost POST = local
# resource, S4U truy cap duoc). Yeu cau quyen 'Log on as a batch job' (admin co san).
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Poke LAAM workflow scheduler moi phut (port $Port)" | Out-Null

Write-Host "OK: task '$TaskName' poke http://localhost:$Port/api/workflows/tick moi phut." -ForegroundColor Green
Write-Host "Kiem tra: Get-ScheduledTask -TaskName '$TaskName' ; hoac doi 1 phut roi xem docker logs laam-v2-app."

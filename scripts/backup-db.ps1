#requires -Version 5.1
<#
  LAAM - backup Postgres (container laam-v2-postgres) ra file SQL:
    backups\laam-<yyyyMMdd-HHmm>.sql
  Tu tao thu muc neu thieu; xoa cac ban backup cu hon -RetentionDays (mac dinh 14).
  Exit code: 0 = thanh cong, 1 = pg_dump loi (file do bi xoa, khong de lai dump hong).

  Dang ky chay HANG NGAY 02:00 (chay 1 lan, quyen admin):
    $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument '-NoProfile -WindowStyle Hidden -File "D:\Projects\personal_projects\LAAM\scripts\backup-db.ps1"'
    $trigger = New-ScheduledTaskTrigger -Daily -At 02:00
    Register-ScheduledTask -TaskName 'LAAM-db-backup' -Action $action -Trigger $trigger `
      -Description 'Backup Postgres LAAM hang ngay (retention 14 ngay)'

  Restore (vao DB sach; xem docs/DEPLOYMENT.md muc 6.2):
    cmd /c "docker exec -i laam-v2-postgres psql -U laam -d laam < backups\laam-<...>.sql"
#>
param(
  [string]$BackupDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'backups'),
  [int]$RetentionDays = 14,
  [string]$Container = 'laam-v2-postgres'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$file  = Join-Path $BackupDir "laam-$stamp.sql"

# Redirect qua cmd de giu nguyen byte stream cua pg_dump - redirect cua
# PowerShell 5.1 se re-encode sang UTF-16 lam psql khong restore duoc.
cmd /c "docker exec $Container pg_dump -U laam laam > `"$file`""
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $file) { Remove-Item $file -Force }
  Write-Host "LOI: pg_dump that bai (container '$Container' co dang chay khong?)." -ForegroundColor Red
  exit 1
}
$sizeKb = [math]::Round((Get-Item $file).Length / 1KB)
Write-Host "OK: $file ($sizeKb KB)" -ForegroundColor Green

# Retention: xoa backup cu hon N ngay (chi dong laam-*.sql trong thu muc backup).
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem (Join-Path $BackupDir 'laam-*.sql') -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Da xoa backup cu: $($_.Name)"
  }
exit 0

#requires -Version 5.1
<#
  LAAM v2 - POC setup (Windows + GPU). Idempotent: chay lai nhieu lan an toan.
  Model POC: qwen3-vl:8b-instruct-q8_0 (1 model ganh chat + tool-call; OCR = Tesseract).
  Quyet dinh: .serena/memories/decisions/poc-model-choice.md

  CHAY BANG QUYEN ADMIN (winget cai may + ghi Program Files + sua PATH may).
  Script KHONG tu chay `npm run start` - in lenh o cuoi de ban tu khoi dong.
#>
$ErrorActionPreference = 'Stop'
$MODEL = 'qwen3-vl:8b-instruct-q8_0'
$V2    = $PSScriptRoot

function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }

# --- 0. Preflight -----------------------------------------------------------
Write-Host "`n== 0. Preflight ==" -ForegroundColor White
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $admin) { Warn "Chua chay bang Admin - winget/PATH/Tesseract co the loi. Nen mo PowerShell as Administrator." }
$missing = @()
foreach ($c in 'node','docker','git') { if (Have $c) { Ok "$c co" } else { $missing += $c } }
if ($missing.Count) { Warn ("THIEU: " + ($missing -join ', ') + " - cai truoc khi tiep tuc."); exit 1 }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Warn "Docker Desktop chua chay - mo Docker Desktop roi chay lai."; exit 1 }
Ok "Docker daemon chay"

# --- 1. Ollama + model ------------------------------------------------------
Write-Host "`n== 1. Ollama + model ($MODEL) ==" -ForegroundColor White
if (-not (Have 'ollama')) {
  Info "Cai Ollama..."
  winget install --id Ollama.Ollama -e --silent --accept-source-agreements --accept-package-agreements
} else { Ok "Ollama co" }
# Giu model thuong tru tren GPU (tranh cold-start). Can restart Ollama de ap dung.
setx OLLAMA_KEEP_ALIVE -1 | Out-Null
Ok "OLLAMA_KEEP_ALIVE=-1 (restart Ollama/may de ap dung)"
Info "Pull model (~9.8 GB, lan dau hoi lau)..."
ollama pull $MODEL
Ok "Model san sang"

# --- 2. Tesseract OCR (vie + eng + chi_sim) ---------------------------------
Write-Host "`n== 2. Tesseract OCR ==" -ForegroundColor White
if (-not (Have 'tesseract')) {
  Info "Cai Tesseract..."
  winget install --id UB-Mannheim.TesseractOCR -e --silent --accept-source-agreements --accept-package-agreements
} else { Ok "Tesseract co" }
$tessDir = Join-Path $env:ProgramFiles 'Tesseract-OCR'
$machPath = [Environment]::GetEnvironmentVariable('Path','Machine')
if ($machPath -notlike "*$tessDir*") {
  [Environment]::SetEnvironmentVariable('Path', "$machPath;$tessDir", 'Machine')
  $env:Path += ";$tessDir"
  Ok "Da them Tesseract vao PATH may"
} else { Ok "Tesseract da trong PATH" }
# Installer winget thuong chi co eng -> tai them vie + chi_sim
$tessdata = Join-Path $tessDir 'tessdata'
foreach ($lang in 'vie','chi_sim') {
  $f = Join-Path $tessdata "$lang.traineddata"
  if (-not (Test-Path $f)) {
    Info "Tai $lang.traineddata..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata" -OutFile $f
    Ok "$lang.traineddata"
  } else { Ok "$lang da co" }
}

# --- 3. Postgres (Docker) ---------------------------------------------------
Write-Host "`n== 3. Postgres (Docker) ==" -ForegroundColor White
Push-Location $V2
docker compose up -d
Ok "Postgres :5432 + Adminer :8080"

# --- 4. .env (khong ghi de neu da co) ---------------------------------------
Write-Host "`n== 4. .env ==" -ForegroundColor White
$envFile = Join-Path $V2 '.env'
if (Test-Path $envFile) {
  Warn ".env da ton tai - giu nguyen. Dam bao co dong: DEFAULT_CHAT_MODEL=$MODEL"
} else {
  $auth = (node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  $conn = (node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  $content = @"
DATABASE_URL=postgresql://laam:laam@localhost:5432/laam
AUTH_SECRET=$auth
OLLAMA_URL=http://localhost:11434
DEFAULT_CHAT_MODEL=$MODEL
CONNECTOR_KEY=$conn
"@
  # WriteAllText -> UTF-8 KHONG BOM (dotenv doc sach dong dau)
  [IO.File]::WriteAllText($envFile, $content)
  Ok ".env da tao (DEFAULT_CHAT_MODEL=$MODEL)"
}

# --- 5. Deps + schema + build ----------------------------------------------
Write-Host "`n== 5. App (deps + migrate + build) ==" -ForegroundColor White
npm ci
npm run db:generate
npm run db:migrate
npm run build
Pop-Location
Ok "Build xong"

# --- Done -------------------------------------------------------------------
Write-Host "`n== HOAN TAT ==" -ForegroundColor White
Write-Host @"
Khoi dong app:
    cd `"$V2`"; npm run start         # http://localhost:3000

Nghiem thu POC (4 nhiem vu):
  1) /register   -> tai khoan dau = owner -> dang nhap
  2) /chat       -> hoi tieng Viet (model: $MODEL)
  3) dinh kem anh chu Viet -> Tesseract OCR -> model tom tat
  4) /connectors -> ket noi GitHub (PAT) -> /chat "liet ke repo cua toi" -> tool-call chay
"@ -ForegroundColor Gray

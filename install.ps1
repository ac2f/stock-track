# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — TEK KOMUTLA otomatik kurulum (Windows / PowerShell)
#
#   Çift tıkla:  install.bat
#   veya:        powershell -ExecutionPolicy Bypass -File install.ps1
#
# Docker Desktop kurulu ve ÇALIŞIR olmalıdır. Geri kalan her şeyi script halleder.
# ───────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)  { Write-Host "[OK] $m" -ForegroundColor Green }
function Fail($m){ Write-Host "[HATA] $m" -ForegroundColor Red }

# UTF-8 (BOM'suz) dosya yazımı — Türkçe karakterler ve .env uyumu için.
function Write-Utf8NoBom($path, $lines) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($path, $lines, $enc)
}
function New-Secret([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
function Set-EnvValue($file, $key, $val) {
  $lines = @(Get-Content -LiteralPath $file -Encoding UTF8)
  $done = $false
  $out = foreach ($l in $lines) {
    if ($l -match "^$([regex]::Escape($key))=") { "$key=$val"; $done = $true } else { $l }
  }
  if (-not $done) { $out += "$key=$val" }
  Write-Utf8NoBom $file $out
}
function Get-EnvValue($file, $key) {
  if (-not (Test-Path $file)) { return '' }
  $line = Get-Content -LiteralPath $file -Encoding UTF8 |
    Where-Object { $_ -match "^$([regex]::Escape($key))=" } | Select-Object -First 1
  if ($line) { return ($line -replace "^$([regex]::Escape($key))=", '') }
  return ''
}

Say 'StockTrack ERP - otomatik kurulum basliyor...'

# 1) Docker kontrolu ────────────────────────────────────────────────────────
try { docker version | Out-Null } catch {
  Fail 'Docker bulunamadi. Docker Desktop kurun: https://www.docker.com/products/docker-desktop/'
  Read-Host 'Cikmak icin Enter'; exit 1
}
try { docker info | Out-Null } catch {
  Fail 'Docker calismiyor. Docker Desktop uygulamasini baslatip tekrar deneyin.'
  Read-Host 'Cikmak icin Enter'; exit 1
}
Ok 'Docker hazir.'

# 2) backend/.env ───────────────────────────────────────────────────────────
if (-not (Test-Path 'backend/.env')) {
  Copy-Item 'backend/.env.example' 'backend/.env'
  Set-EnvValue 'backend/.env' 'NODE_ENV' 'production'
  Set-EnvValue 'backend/.env' 'DB_SYNCHRONIZE' 'true'
  Set-EnvValue 'backend/.env' 'JWT_ACCESS_SECRET' (New-Secret)
  Set-EnvValue 'backend/.env' 'JWT_REFRESH_SECRET' (New-Secret)
  Set-EnvValue 'backend/.env' 'DB_PASSWORD' (New-Secret 12)
  Ok 'backend/.env uretildi (guclu secretlar atandi).'
} else {
  Ok 'backend/.env zaten var - korunuyor.'
}

# 3) Kok .env (compose Postgres parolasi = backend/.env) ─────────────────────
$dbPass = Get-EnvValue 'backend/.env' 'DB_PASSWORD'; if (-not $dbPass) { $dbPass = 'stocktrack' }
$dbUser = Get-EnvValue 'backend/.env' 'DB_USERNAME'; if (-not $dbUser) { $dbUser = 'stocktrack' }
$dbName = Get-EnvValue 'backend/.env' 'DB_NAME';     if (-not $dbName) { $dbName = 'stocktrack' }
Write-Utf8NoBom '.env' @(
  '# Docker Compose interpolation (Postgres) - backend/.env ile ESLESMELI.'
  "DB_USERNAME=$dbUser"
  "DB_PASSWORD=$dbPass"
  "DB_NAME=$dbName"
)
Ok 'Kok .env yazildi.'

# 4) Derle + baslat ─────────────────────────────────────────────────────────
Say 'Imajlar derleniyor ve servisler baslatiliyor (ilk sefer birkac dakika surebilir)...'
docker compose -f docker-compose.prod.yml up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'docker compose basarisiz oldu.'; Read-Host 'Cikmak icin Enter'; exit 1 }
Ok 'Servisler ayakta.'

# 5) Erisim bilgisi ─────────────────────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = 'localhost' }
$oEmail = Get-EnvValue 'backend/.env' 'SEED_OWNER_EMAIL';    if (-not $oEmail) { $oEmail = 'owner@stocktrack.local' }
$oPass  = Get-EnvValue 'backend/.env' 'SEED_OWNER_PASSWORD'; if (-not $oPass)  { $oPass  = 'Owner123!' }

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' Kurulum tamamlandi!' -ForegroundColor Green
Write-Host " Arayuz : http://$ip/            (bu bilgisayar: http://localhost/)"
Write-Host " API    : http://$ip`:3000/api"
Write-Host " Giris  : $oEmail  /  $oPass"
Write-Host '------------------------------------------------------------' -ForegroundColor Green
Write-Host ' Durdur : docker compose -f docker-compose.prod.yml down'
Write-Host ' Baslat : docker compose -f docker-compose.prod.yml up -d'
Write-Host '============================================================' -ForegroundColor Green
Read-Host 'Kapatmak icin Enter'

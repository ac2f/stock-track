# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — TEK KOMUTLA otomatik kurulum (Windows / PowerShell)
#
#   Çift tıkla:  install.bat                (normal kurulum/güncelleme)
#   Sıfırlama :  install.bat --reset        (veritabanını SİLER, baştan kurar)
#   veya:        powershell -ExecutionPolicy Bypass -File install.ps1 [-Reset]
#
# Docker Desktop kurulu ve ÇALIŞIR olmalıdır. Gerisini script halleder.
# ───────────────────────────────────────────────────────────────────────────
param([switch]$Reset)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)  { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[!] $m" -ForegroundColor Yellow }
function Fail($m){ Write-Host "[HATA] $m" -ForegroundColor Red }

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
  Write-Utf8NoBom $file @($out)
}
function Get-EnvValue($file, $key) {
  if (-not (Test-Path $file)) { return '' }
  $line = Get-Content -LiteralPath $file -Encoding UTF8 |
    Where-Object { $_ -match "^$([regex]::Escape($key))=" } | Select-Object -First 1
  if ($line) { return ($line -replace "^$([regex]::Escape($key))=", '') }
  return ''
}

# Derleme basarisiz olunca: sorun internet mi, baska bir sey mi? Docker'in ICINDEN
# npm kayit sunucusuna ulasmayi dener ve duruma gore ne yapilacagini soyler.
function Show-BuildHelp {
  Write-Host ''
  Say 'Docker icinden internet erisimi denetleniyor...'
  $js = "fetch('https://registry.npmjs.org/-/ping',{signal:AbortSignal.timeout(20000)}).then(r=>{console.log('npm kayit sunucusu: HTTP '+r.status);process.exit(r.ok?0:1)}).catch(e=>{console.log('ULASILAMADI: '+((e.cause&&e.cause.code)||e.message));process.exit(1)})"
  docker run --rm node:20-alpine node -e $js
  if ($LASTEXITCODE -eq 0) {
    Warn 'Internet erisimi var gorunuyor; hata aginizdan degil, derlemeden geliyor.'
    Write-Host 'Yukaridaki ilk "error" satirina bakin ve o satiri bize iletin.' -ForegroundColor Yellow
  } else {
    Warn 'Docker, npm kayit sunucusuna ulasamiyor (internet/DNS sorunu). Sirayla deneyin:'
    Write-Host '  1) Docker Desktop > Settings > Docker Engine, JSON icine su satiri ekleyin:' -ForegroundColor Yellow
    Write-Host '       "dns": ["8.8.8.8", "1.1.1.1"]' -ForegroundColor White
    Write-Host '     (virgulle ayirmayi unutmayin) > Apply & restart' -ForegroundColor Yellow
    Write-Host '  2) VPN, proxy veya antivirus guvenlik duvari aciksa kapatip deneyin.' -ForegroundColor Yellow
    Write-Host '     Kurumsal proxy varsa: Docker Desktop > Settings > Resources > Proxies.' -ForegroundColor Yellow
    Write-Host '  3) Mumkunse Wi-Fi yerine kablolu baglanti kullanin.' -ForegroundColor Yellow
    Write-Host '  4) install.bat dosyasini yeniden calistirin. Indirilenler onbellekte kalir,' -ForegroundColor Yellow
    Write-Host '     kurulum kaldigi yerden devam eder.' -ForegroundColor Yellow
  }
}

# --reset argümanı (bat üzerinden gelebilir)
if ($args -contains '--reset') { $Reset = $true }

Say 'StockTrack ERP - otomatik kurulum basliyor...'

# 1) Docker
try { docker version | Out-Null } catch {
  Fail 'Docker bulunamadi. Docker Desktop kurun: https://www.docker.com/products/docker-desktop/'
  Read-Host 'Cikmak icin Enter'; exit 1
}
try { docker info | Out-Null } catch {
  Fail 'Docker calismiyor. Docker Desktop uygulamasini baslatip tekrar deneyin.'
  Read-Host 'Cikmak icin Enter'; exit 1
}
Ok 'Docker hazir.'
$prod = @('compose', '-f', 'docker-compose.prod.yml')

# 2) --reset
if ($Reset) {
  Warn '--reset: mevcut veritabani (volume) ve container''lar siliniyor...'
  docker @prod down -v --remove-orphans 2>$null | Out-Null
  Ok 'Eski durum temizlendi.'
}

# 3) backend/.env  (Postgres host'a acik degil → DB parolasi sabit; JWT rastgele)
if (-not (Test-Path 'backend/.env')) {
  Copy-Item 'backend/.env.example' 'backend/.env'
  Set-EnvValue 'backend/.env' 'NODE_ENV' 'production'
  Set-EnvValue 'backend/.env' 'DB_SYNCHRONIZE' 'true'
  Set-EnvValue 'backend/.env' 'JWT_ACCESS_SECRET' (New-Secret)
  Set-EnvValue 'backend/.env' 'JWT_REFRESH_SECRET' (New-Secret)
  Ok 'backend/.env uretildi (guclu JWT secretlari atandi).'
} else {
  Ok 'backend/.env zaten var - korunuyor.'
}

# 4) Kok .env
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

# 5) Derle + baslat
Say 'Imajlar derleniyor ve servisler baslatiliyor (ilk sefer birkac dakika surebilir)...'
# Imajlar sirayla derlenir: iki imaj ayni anda internetten paket indirince kararsiz
# aglarda zaman asimi olusuyordu. Basarisiz olursa 3 kez denenir; indirilenler
# derleme onbelleginde kalir, her deneme kaldigi yerden devam eder.
$env:COMPOSE_PARALLEL_LIMIT = '1'
$built = $false
for ($try = 1; $try -le 3; $try++) {
  docker @prod build
  if ($LASTEXITCODE -eq 0) { $built = $true; break }
  if ($try -lt 3) {
    Warn "Derleme basarisiz oldu (deneme $try/3). 15 saniye sonra yeniden denenecek..."
    Start-Sleep -Seconds 15
  }
}
if (-not $built) {
  Fail 'Imajlar derlenemedi.'
  Show-BuildHelp
  Read-Host 'Cikmak icin Enter'; exit 1
}
docker @prod up -d
if ($LASTEXITCODE -ne 0) { Fail 'docker compose basarisiz oldu.'; Read-Host 'Cikmak icin Enter'; exit 1 }
Ok 'Container''lar baslatildi.'

# 6) API hazir olana kadar bekle
Say "API'nin hazir olmasi bekleniyor..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/health' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = 'localhost' }
$oEmail = Get-EnvValue 'backend/.env' 'SEED_OWNER_EMAIL';    if (-not $oEmail) { $oEmail = 'owner@stocktrack.local' }
$oPass  = Get-EnvValue 'backend/.env' 'SEED_OWNER_PASSWORD'; if (-not $oPass)  { $oPass  = 'Owner123!' }

if (-not $ready) {
  Fail 'API beklenen surede yanit vermedi. Son API kayitlari:'
  docker @prod logs --tail 40 api
  Write-Host ''
  Write-Host 'Ipucu: DB parolasi eski bir volume ile uyusmuyorsa, SIFIRLAYIP yeniden kurun:' -ForegroundColor Yellow
  Write-Host '  install.bat --reset      (veritabanini siler)' -ForegroundColor Yellow
  Read-Host 'Cikmak icin Enter'; exit 1
}
Ok 'API hazir.'

# 7b) Ilk hesap/varsayilanlari kesinlestir (idempotent + gorunur)
Say 'Ilk kullanici ve varsayilanlar kontrol ediliyor...'
docker @prod run --rm api node dist/database/seed.js
if ($LASTEXITCODE -ne 0) { Warn 'Tohumlama adimi uyari verdi - yukaridaki kayitlara bakin.' }

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' Kurulum tamamlandi!' -ForegroundColor Green
Write-Host " Arayuz : http://$ip/            (bu bilgisayar: http://localhost/)"
Write-Host " API    : http://$ip`:3000/api"
Write-Host " Giris  : $oEmail  /  $oPass"
Write-Host '------------------------------------------------------------' -ForegroundColor Green
Write-Host ' Durdur : docker compose -f docker-compose.prod.yml down'
Write-Host ' Sifirla: install.bat --reset   (veritabanini siler)'
Write-Host '============================================================' -ForegroundColor Green
Read-Host 'Kapatmak icin Enter'

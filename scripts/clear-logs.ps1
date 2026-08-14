# ───────────────────────────────────────────────────────────────────────────
# StockTrack ERP — Docker loglarını temizler (Windows / PowerShell)
#
#   Çift tıkla:  clear-logs.bat
#   Alan da geri kazan: clear-logs.bat --prune
#
# NASIL ÇALIŞIR: Docker'ın log dosyaları container'a aittir ve container
# SİLİNDİĞİNDE birlikte silinir. Bu yüzden servisler `down` edilip yeniden
# `up` edilir → loglar sıfırlanır. Veritabanı ADLANDIRILMIŞ VOLUME'de (pgdata)
# durduğu için bu işlem VERİYİ SİLMEZ (`down -v` KULLANILMAZ).
#
# Not: Loglar artık kendiliğinden de sınırlıdır (servis başına 3 x 10 MB;
# docker-compose dosyalarındaki `logging` ayarı). Bu betik, biriken mevcut
# logları hemen boşaltmak içindir.
# ───────────────────────────────────────────────────────────────────────────
param([switch]$Prune)
$ErrorActionPreference = 'Stop'
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

function Say($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)  { Write-Host "[OK] $m" -ForegroundColor Green }
function Fail($m){ Write-Host "[HATA] $m" -ForegroundColor Red }

if ($args -contains '--prune') { $Prune = $true }

try { docker info | Out-Null } catch {
  Fail 'Docker calismiyor. Docker Desktop uygulamasini baslatip tekrar deneyin.'
  Read-Host 'Cikmak icin Enter'; exit 1
}

$prod = @('compose', '-f', 'docker-compose.prod.yml')

Say 'Mevcut log boyutlari:'
docker ps -a --filter 'name=stocktrack' --format '{{.Names}}' | ForEach-Object {
  $logPath = docker inspect --format '{{.LogPath}}' $_ 2>$null
  if ($logPath) {
    # Log dosyasi Docker VM'inin icinde; boyutu container icinden okutuyoruz.
    $size = docker run --rm -v /var/lib/docker:/host-docker:ro alpine sh -c `
      "stat -c %s /host-docker$($logPath -replace '^/var/lib/docker','') 2>/dev/null || echo 0" 2>$null
    Write-Host ("  {0,-24} {1} bayt" -f $_, $size)
  }
}

Say ''
Say 'Servisler durduruluyor (VERITABANI SILINMEZ - down -v kullanilmiyor)...'
docker @prod down
if ($LASTEXITCODE -ne 0) { Fail 'Servisler durdurulamadi.'; Read-Host 'Cikmak icin Enter'; exit 1 }
Ok 'Container''lar kaldirildi - log dosyalari da onlarla birlikte silindi.'

if ($Prune) {
  Say 'Kullanilmayan imaj ve derleme onbellegi temizleniyor...'
  docker image prune -f | Out-Null
  docker builder prune -f | Out-Null
  Ok 'Onbellek temizlendi.'
}

Say 'Servisler yeniden baslatiliyor...'
docker @prod up -d
if ($LASTEXITCODE -ne 0) { Fail 'Servisler baslatilamadi.'; Read-Host 'Cikmak icin Enter'; exit 1 }

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' Loglar temizlendi, servisler calisiyor.' -ForegroundColor Green
Write-Host ' Veritabani korundu (pgdata volume).' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Read-Host 'Kapatmak icin Enter'

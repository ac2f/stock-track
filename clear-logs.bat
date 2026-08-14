@echo off
REM StockTrack ERP - Docker loglarini temizler.
REM   Cift tikla: loglari sifirlar (VERITABANINA DOKUNMAZ).
REM   Alan da geri kazan: clear-logs.bat --prune
REM Docker Desktop kurulu ve calisir olmali.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\clear-logs.ps1" %*

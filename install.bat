@echo off
REM StockTrack ERP - Windows tek tikla kurulum.
REM   Cift tikla: normal kurulum.    Sifirlama: komut satirindan  install.bat --reset
REM Docker Desktop kurulu ve calisir olmali.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

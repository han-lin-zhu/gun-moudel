@echo off
cd /d "%~dp0"
node scripts\start-preview.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

echo Starting Azerfall Tools on http://localhost:5127
start "" http://localhost:5127
node server.js
pause

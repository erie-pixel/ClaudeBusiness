@echo off
rem Desktop Companion launcher - double-click to install & run (no PowerShell needed)
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [1/3] Node.js not found. Trying automatic install via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo Automatic install failed.
    echo Please install Node.js LTS manually from https://nodejs.org and run this file again.
    pause
    exit /b 1
  )
  echo.
  echo Node.js installed. PLEASE CLOSE this window and double-click run.bat AGAIN.
  echo (A fresh window is needed so Windows can find the new node command.)
  pause
  exit /b 0
)

if not exist node_modules (
  echo [2/3] Installing dependencies... this can take a few minutes on first run.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
)

echo [3/3] Starting Desktop Companion... look above the taskbar for the character!
echo To quit: right-click the character ^> quit, or use the tray heart icon.
call npm start
if errorlevel 1 pause

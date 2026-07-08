@echo off
rem Desktop Companion launcher - double-click to install & run (no PowerShell needed)
rem If something fails, this window STAYS OPEN and writes run-log.txt - screenshot either one.
setlocal EnableExtensions
title Desktop Companion Launcher
cd /d "%~dp0"

set LOG=run-log.txt
echo ==== Desktop Companion launcher ==== > "%LOG%"
echo folder: %CD% >> "%LOG%"

echo.
echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js not found. Trying automatic install via winget...
  echo   node: NOT FOUND, trying winget >> "%LOG%"
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo   ============================================================
  echo   If the install above succeeded:
  echo     CLOSE this window and double-click run.bat ONE MORE TIME.
  echo   If it failed:
  echo     Install Node.js LTS from https://nodejs.org then run again.
  echo   ============================================================
  pause
  exit /b 0
)
for /f "delims=" %%v in ('node -v 2^>nul') do set NODEV=%%v
echo   Node %NODEV% OK
echo   node: %NODEV% >> "%LOG%"

echo [2/4] Checking npm...
call npm -v >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   npm is not working. Please reinstall Node.js LTS from https://nodejs.org
  echo   npm: FAILED >> "%LOG%"
  pause
  exit /b 1
)
echo   npm OK

echo [3/4] Installing dependencies (first run can take a few minutes)...
if not exist "node_modules\electron\dist\electron.exe" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo   npm install FAILED >> "%LOG%"
    echo.
    echo   npm install FAILED. Common causes: no internet, antivirus, VPN/proxy.
    echo   Fix the connection, DELETE the node_modules folder, and run again.
    pause
    exit /b 1
  )
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo   electron.exe missing after install >> "%LOG%"
  echo.
  echo   Electron did not download completely (often blocked by antivirus/proxy).
  echo   DELETE the node_modules folder and double-click run.bat again.
  pause
  exit /b 1
)
echo   dependencies OK

echo [4/4] Building and starting... a small pixel character will appear on your desktop.
echo   (This window must stay open while the character is running.)
echo   To quit: right-click the character ^> quit, or the tray heart icon ^> quit.
call npm start
set EXITCODE=%errorlevel%
echo app exited with code %EXITCODE% >> "%LOG%"
echo.
echo App exited (code %EXITCODE%).
echo If the character never appeared or this happened instantly,
echo screenshot THIS window (or send run-log.txt) so it can be fixed.
pause

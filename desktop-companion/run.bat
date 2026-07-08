@echo off
rem Desktop Companion launcher v3 - double-click to install & run.
rem EVERYTHING - npm install/start output - is written to run-log.txt for debugging.
rem RULE: never use parentheses inside if/for blocks below, not even in echo text -
rem cmd counts them as block delimiters and the whole script dies at parse time.
setlocal EnableExtensions
title Desktop Companion Launcher
cd /d "%~dp0"

set LOG=run-log.txt
echo ==== Desktop Companion launcher v3 ==== > "%LOG%"
echo folder: %CD% >> "%LOG%"

echo.
echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo   node: NOT FOUND, trying winget >> "%LOG%"
  echo   Node.js not found. Trying automatic install via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo   If the install above succeeded: CLOSE this window and run run.bat AGAIN.
  echo   If it failed: install Node.js LTS from https://nodejs.org then run again.
  pause
  exit /b 0
)
for /f "delims=" %%v in ('node -v 2^>nul') do set NODEV=%%v
echo   Node %NODEV% OK
echo node: %NODEV% >> "%LOG%"

echo [2/4] Checking npm...
call npm -v >> "%LOG%" 2>&1
if errorlevel 1 (
  echo npm: FAILED >> "%LOG%"
  echo   npm is not working. Please reinstall Node.js LTS from https://nodejs.org
  goto :fail
)
echo   npm OK

echo [3/4] Installing dependencies...
echo step3: install >> "%LOG%"
if not exist "node_modules\electron\dist\electron.exe" (
  echo   First run: this takes a FEW MINUTES with no output here.
  echo   Progress is being written to run-log.txt - do not close this window.
  call npm install --no-audit --no-fund >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo step3: npm install FAILED >> "%LOG%"
    echo   npm install FAILED. Common causes: no internet, antivirus, VPN/proxy,
    echo   or OneDrive locking files - move this folder to C:\officebud and retry.
    goto :fail
  )
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo step3: electron.exe still missing >> "%LOG%"
  echo   Electron did not download completely - antivirus, proxy, or OneDrive may have blocked it.
  echo   DELETE the node_modules folder and double-click run.bat again.
  goto :fail
)
echo   dependencies OK
echo step3: done >> "%LOG%"

echo [4/4] Starting... a small pixel character will appear on your desktop.
echo   Keep this window open. Quit: right-click character or tray heart icon.
echo step4: npm start >> "%LOG%"
call npm start >> "%LOG%" 2>&1
set EXITCODE=%errorlevel%
echo step4: exited %EXITCODE% >> "%LOG%"
echo.
echo App exited - code %EXITCODE%. Last log lines:
echo ------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Tail 25 '%LOG%'" 2>nul
echo ------------------------------------------------------------
echo If something went wrong, send run-log.txt (in this folder) or a screenshot.
pause
exit /b %EXITCODE%

:fail
echo.
echo ------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Tail 25 '%LOG%'" 2>nul
echo ------------------------------------------------------------
echo FAILED. Send run-log.txt (in this folder) or a screenshot of this window.
pause
exit /b 1

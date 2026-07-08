@echo off
rem Desktop Companion DEBUG launcher - keeps this window open and logs everything.
rem Use this when run.bat launches but the character never appears.
rem RULE: no parentheses inside if/for blocks, even in echo text.
setlocal EnableExtensions
title Desktop Companion DEBUG
cd /d "%~dp0"

set LOG=run-log.txt
echo ==== Desktop Companion DEBUG ==== > "%LOG%"
echo folder: %CD% >> "%LOG%"

echo Building...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Build FAILED - see run-log.txt
  goto :done
)

echo Starting with console attached - errors will appear below and in run-log.txt.
echo Close the app to return here.
"node_modules\electron\dist\electron.exe" . 2>> "%LOG%"
echo app exited with code %errorlevel% >> "%LOG%"

:done
echo.
echo ------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Tail 30 '%LOG%'" 2>nul
echo ------------------------------------------------------------
echo Send run-log.txt or a screenshot of this window if something looks wrong.
pause

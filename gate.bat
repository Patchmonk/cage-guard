@echo off
setlocal
title Cage Guard - GATE (Lock / Unlock)
rem Thin launcher: opens the interactive project hub.
rem All logic lives in guard.mjs; this file only starts it.

node "%~dp0guard.mjs" menu
set "EXIT_CODE=%errorlevel%"

echo.
echo Press any key to close this window...
pause >nul
exit /b %EXIT_CODE%
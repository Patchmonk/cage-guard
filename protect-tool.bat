@echo off
setlocal
title Cage Guard - Protect Tool Source
cd /d "%~dp0"

node "%~dp0guard.mjs" protect-tool
set "EXIT=%errorlevel%"

echo.
echo Press any key to close this window...
pause >nul
exit /b %EXIT%
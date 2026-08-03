@echo off
setlocal
title CageGuard - Check All Projects
cd /d "%~dp0"

node "%~dp0guard.mjs" check
set "EXIT=%errorlevel%"

echo.
echo Press any key to close this window...
pause >nul
exit /b %EXIT%
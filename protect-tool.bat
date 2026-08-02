@echo off
title Cage Guard — Protect Tool Source
echo Protecting tool source files...
attrib +r "%~dp0guard.mjs"
attrib +r /s "%~dp0src\*"
attrib +r /s "%~dp0configs\*"
echo.
echo Tool source is now read-only.
echo NOTE: hashes/ and reports/ remain writable (required for operation).
echo.
pause

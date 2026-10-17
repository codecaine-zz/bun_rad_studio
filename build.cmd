@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_windows.ps1" %*
set "result=%ERRORLEVEL%"
if not "%BUN_BUILD_NO_PAUSE%"=="1" pause
exit /b %result%

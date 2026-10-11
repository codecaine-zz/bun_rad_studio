@echo off
REM ⚡ Bun RAD Studio - Universal Windows Runner Wrapper
REM Usage:
REM   run                (Opens interactive menu)
REM   run calculator     (Launches Universal Calculator Studio)
REM   run 23             (Launches Demo 23 Theme Showcase)
REM   run pacman         (Launches Pac-Man Arcade)
REM   run -list          (Lists all apps and demos)
REM   run -gui           (Opens Launcher Studio Pro GUI)

setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
endlocal

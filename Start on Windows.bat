@echo off
title Research desk
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   Get it from https://nodejs.org  - pick the LTS button, install, then
  echo   double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)

echo.
echo   Starting the research desk. Your browser will open in a moment.
echo   Keep this window open while you work. Close it to stop.
echo.
node server.js
pause

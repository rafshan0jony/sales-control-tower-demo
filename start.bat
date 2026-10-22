@echo off
title Demo Company - Sales Control Tower
cd /d "%~dp0"
echo Starting Demo Sales Control Tower...
echo.
echo Dashboard will open at:  http://localhost:8080
echo Login: admin  /  admin123
echo Press Ctrl+C to stop.
echo.
start "" http://localhost:8080
node server/index.js
pause

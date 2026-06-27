@echo off
REM Navigate to project folder
cd /d "%~dp0"

REM Start Python HTTP server on port 5500
start python -m http.server 5500

REM Wait 2 seconds for server to start
timeout /t 2 >nul

REM Open game in default browser
start http://127.0.0.1:5500/index.html

exit

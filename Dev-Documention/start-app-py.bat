@echo off
REM Navigate to project folder
cd /d "%~dp0"

REM Start Python HTTP server on port 5600
start python -m http.server 5600

REM Wait 2 seconds for server to start
timeout /t 2 >nul

REM Open app in default browser
start http://127.0.0.1:5600/index.html

exit

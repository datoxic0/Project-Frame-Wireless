@echo off
REM Start the dev server and open the App in browser

REM Navigate to project folder (adjust path if needed)
cd /d "%~dp0"

REM Start npx run http-server on port 5600
start npx run http-server -p 5600

REM Give server a moment to start
timeout /t 2 >nul

REM Open the app in default browser
start http://127.0.0.1:5600/index.html

exit

@echo off
REM Start the dev server and open the game in browser

REM Navigate to project folder (adjust path if needed)
cd /d "%~dp0"

REM Start http-server on port 5500
start npx serve
http-server -p 5500

REM Give server a moment to start
timeout /t 2 >nul

REM Open the game in default browser
start http://127.0.0.1:5500/index.html

exit

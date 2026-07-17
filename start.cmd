@echo off
REM Double-click this file to run the Sailing Route Planner locally.
REM It starts the Node server (which serves the app AND saves route debug logs
REM to the logs\ folder) and opens the app in your browser.
REM Leave this window open while using the app. Close it (or press Ctrl+C) to stop.

cd /d "%~dp0"
echo Starting Sailing Route Planner on http://localhost:8123 ...
echo (Leave this window open. Close it to stop the server.)

REM Open the browser a couple of seconds after the server starts booting.
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:8123/index.html"

REM Start the Node server (serves the app and receives route logs). Blocks.
node server\index.js

@echo off
rem ===== BVN Package - Admin Console launcher =====
rem Serves this folder locally and opens the console in your browser.
cd /d "%~dp0"
echo Starting BVN Admin Console at http://127.0.0.1:8777 ...
start "" "http://127.0.0.1:8777/index.html"
py -m http.server 8777 --bind 127.0.0.1

@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED_NODE%" goto run_bundled

node -v
if errorlevel 1 goto missing_node

node server.js
goto end

:run_bundled
"%BUNDLED_NODE%" server.js
goto end

:missing_node
echo Node.js is not installed.
echo Install Node.js LTS from https://nodejs.org and run this file again.
pause

:end
endlocal

@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=8787"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Please install Node.js 22+ and try again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  pause
  exit /b 1
)

for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js 22+ is required. Current major version: %NODE_MAJOR%
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo [INFO] .env not found. Creating from .env.example...
    copy /y ".env.example" ".env" >nul
  )
)

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "KEY=%%A"
    set "VALUE=%%B"
    if not "!KEY!"=="" if not "!KEY:~0,1!"=="#" (
      if /I "!KEY!"=="HOST" set "HOST=!VALUE!"
      if /I "!KEY!"=="PORT" set "PORT=!VALUE!"
    )
  )
  set "HOST=%HOST:"=%"
  set "PORT=%PORT:"=%"
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

set "LISTEN_PID="
for /f %%P in ('powershell -NoProfile -Command "$c=Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue ^| Select-Object -First 1; if($c){$c.OwningProcess}"') do set "LISTEN_PID=%%P"

if defined LISTEN_PID (
  echo [ERROR] Port %PORT% is already in use by PID %LISTEN_PID%.
  for /f "delims=" %%C in ('powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter \"ProcessId=%LISTEN_PID%\" -ErrorAction SilentlyContinue; if($p){$p.CommandLine}"') do set "LISTEN_CMD=%%C"
  if defined LISTEN_CMD echo [INFO] Process: %LISTEN_CMD%
  echo [INFO] Stop it with: taskkill /PID %LISTEN_PID% /F
  echo [INFO] Or set another PORT in .env and rerun start.bat
  pause
  exit /b 1
)

echo [INFO] Starting server...
echo [INFO] UI: http://%HOST%:%PORT%/
echo [INFO] MCP: http://%HOST%:%PORT%/mcp
echo.
call npm run mcp:http

if errorlevel 1 (
  echo.
  echo [ERROR] Server exited with error.
  pause
  exit /b 1
)

endlocal

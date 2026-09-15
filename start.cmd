@echo off
title Green Proxy
cd /d "%~dp0"

echo ============================================
echo   Green Proxy - Multi-provider Claude Proxy
echo ============================================
echo.

rem Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node v18+ and retry.
    echo        Download: https://nodejs.org/
    pause
    exit /b 1
)

rem Read port from config.json (fallback 18101)
set "PORT_CFG=18101"
for /f "usebackq tokens=2 delims=:," %%a in (`findstr /c:"port" "%~dp0config.json" 2^>nul`) do (
    set "PORT_CFG=%%~a"
)
set "PORT_CFG=%PORT_CFG: =%"
if "%PORT_CFG%"=="" set "PORT_CFG=18101"

rem Check if port is already in use
netstat -ano | findstr ":%PORT_CFG% " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo [INFO] Port %PORT_CFG% is already in use. Proxy may already be running.
    echo        Opening console...
    start "" "http://127.0.0.1:%PORT_CFG%/console"
    exit /b 0
)

echo Starting proxy on http://127.0.0.1:%PORT_CFG% ...
echo.

rem Start node in background (minimized)
start "GreenProxy" /min node.exe "%~dp0proxy.mjs"

rem Wait for readiness
echo Waiting for proxy to be ready...
set /a "WAIT=0"
:WAIT_LOOP
timeout /t 1 /nobreak >nul
set /a "WAIT+=1"
curl -s "http://127.0.0.1:%PORT_CFG%/v1/models" >nul 2>nul
if not errorlevel 1 goto READY
if %WAIT% GEQ 15 (
    echo [ERROR] Proxy failed to start within 15s. Check proxy.err.log
    pause
    exit /b 1
)
goto WAIT_LOOP

:READY
echo [OK] Proxy is ready!
echo.
echo   Console: http://127.0.0.1:%PORT_CFG%/console
echo   Claude Code base: http://127.0.0.1:%PORT_CFG%
echo.

rem Open browser console
start "" "http://127.0.0.1:%PORT_CFG%/console"
echo Console opened in browser.
echo Closing this window will NOT stop the proxy.
echo.
echo Press any key to close this window...
pause >nul

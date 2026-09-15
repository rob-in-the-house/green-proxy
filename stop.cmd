@echo off
title Green Proxy - Stop
cd /d "%~dp0"

echo ============================================
echo   Green Proxy - Stop Proxy
echo ============================================
echo.

rem Read port from config.json (fallback 18101)
set "PORT_CFG=18101"
for /f "usebackq tokens=2 delims=:," %%a in (`findstr /c:"port" "%~dp0config.json" 2^>nul`) do (
    set "PORT_CFG=%%~a"
)
set "PORT_CFG=%PORT_CFG: =%"
if "%PORT_CFG%"=="" set "PORT_CFG=18101"

rem Find and kill process listening on the port
echo Searching for proxy process on port %PORT_CFG% ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT_CFG% " ^| findstr "LISTENING"') do (
    echo   Found process PID=%%a
    taskkill /F /PID %%a >nul 2>nul
    echo   Terminated PID=%%a
)

echo.
echo Proxy stopped.
timeout /t 2 /nobreak >nul

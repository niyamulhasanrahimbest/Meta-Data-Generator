@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo    Meta Data Generator - Windows .exe Desktop Builder
echo ========================================================
echo.
echo [1/3] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Resolving peer dependency conflicts with --legacy-peer-deps...
    call npm install --legacy-peer-deps
)
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Building production assets...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build step failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Generating Windows .exe executable files...
call npx electron-builder --win
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo [SUCCESS] Your software is ready in the "release" folder!
echo ========================================================
if exist "release" (
    dir /b "release\*.exe"
)
echo.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-windows.ps1"
if errorlevel 1 (
 echo [FAILED] Check the error above.
 pause
 exit /b 1
)
echo [PASS] All native tests and build checks completed.
pause

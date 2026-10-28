@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "PlantPreviewServer" cmd /k "py -3 -m http.server 8060 --bind 127.0.0.1"
) else (
  start "PlantPreviewServer" cmd /k "python -m http.server 8060 --bind 127.0.0.1"
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8060/settings.html"
echo 预览已打开；请保留 PlantPreviewServer 窗口，关闭该窗口即可停止本地服务。

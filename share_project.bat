@echo off
title MediSense AI - Cloudflare Public Tunnel
echo ========================================================
echo   MediSense AI - Generating Public Shareable Link
echo ========================================================
echo.
echo Connecting local app (Port 5173) to Cloudflare Global Edge...
echo.
.\cloudflared.exe tunnel --url http://localhost:5173 --http-host-header="localhost:5173"
pause

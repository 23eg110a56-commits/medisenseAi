@echo off
title MediSense AI - Backend Server
echo Starting MediSense AI Backend on http://127.0.0.1:8000...
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause

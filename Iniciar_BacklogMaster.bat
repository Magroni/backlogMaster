@echo off
title Game Backlog Master - Detector PC + Tracker Local
cd /d "%~dp0"

echo ========================================================
echo   GAME BACKLOG MASTER (PC + Steam + Epic + Game Pass)
echo   Detector automatico em segundo plano ativo!
echo ========================================================
echo.
echo Abrindo interface em http://127.0.0.1:8765 ...
start "" http://127.0.0.1:8765
"%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8765
pause

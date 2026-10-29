@echo off
title DigiWave X — Live Presentation Launcher
echo ============================================================
echo   DIGIWAVE X : AI-Verified Digital Communications Virtual Lab
echo ============================================================
echo.
echo [1/2] Checking Python virtual environment...
if exist "backend\.venv\Scripts\python.exe" (
    echo [OK] Virtualenv found. Starting FastAPI Backend on port 8000...
    start "DigiWave Backend (FastAPI)" /min cmd /c "cd backend && .venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port 8000 --reload"
) else (
    echo [INFO] Backend virtualenv not active. Running with standalone mathematical oracle.
)

echo.
echo [2/2] Launching Frontend Interface...
start "" "frontend\index.html"

echo.
echo ============================================================
echo   Application started!
echo   Frontend: Opened in your default browser
echo   Backend:  http://127.0.0.1:8000 (if uvicorn active)
echo ============================================================
pause

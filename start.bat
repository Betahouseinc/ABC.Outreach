@echo off
echo Starting MailBlast...
start "Backend" cmd /k "cd /d "%~dp0backend" && node --experimental-sqlite server.js"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Setup: copy backend\.env.example to backend\.env and add your RESEND_API_KEY
pause

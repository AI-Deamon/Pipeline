@echo off
chcp 65001 >nul

REM DevSecOps Pipeline Development Startup Script (Windows)
REM Starts both frontend and backend services simultaneously

echo.
echo 🚀 Starting DevSecOps Pipeline Development Environment
echo ==================================================
echo.

REM Check if we're in the Agent directory
if not exist "run.py" (
    echo Error: Please run this script from the Agent directory
    echo Usage: cd Agent && start-dev.bat
    pause
    exit /b 1
)

REM Check prerequisites
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop for Windows
    pause
    exit /b 1
)

where python >nul 2>&1
if %errorlevel% neq 0 (
    where python3 >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Python is not installed or not in PATH
        echo Please install Python 3.8 or later
        pause
        exit /b 1
    )
)

REM Start backend services
echo [INFO] Starting backend services with Docker...
start "Backend Services" cmd /c "python run.py dev"
timeout /t 5 >nul

REM Start frontend
echo [INFO] Starting frontend development server...

if exist "node_modules" (
    echo [INFO] Frontend dependencies already installed
) else (
    echo [INFO] Installing frontend dependencies...
    if exist "pnpm-lock.yaml" (
        pnpm install
    ) else (
        npm install
    )
)

REM Start frontend server
if exist "pnpm-lock.yaml" (
    start "Frontend Dev Server" cmd /c "pnpm dev"
) else (
    start "Frontend Dev Server" cmd /c "npm run dev"
)

echo.
echo [INFO] Waiting for services to be ready...
echo.

REM Wait for services
echo [INFO] Checking Backend API at http://localhost:8000...
call :wait_for_service "http://localhost:8000" "Backend API"

echo [INFO] Checking Frontend at http://localhost:5173...
call :wait_for_service "http://localhost:5173" "Frontend"

echo [INFO] Checking Jenkins at http://localhost:8080...
call :wait_for_service "http://localhost:8080" "Jenkins"

echo.
echo ==================================================
echo ✅ Development environment is ready!
echo.
echo Available services:
echo   • Frontend:     http://localhost:5173
echo   • Backend API:  http://localhost:8000
echo   • Jenkins:      http://localhost:8080
echo.
echo To stop all services:
echo   1. Close the frontend window (Ctrl+C or close window)
echo   2. Run: python run.py down
echo ==================================================
echo.

pause
goto :eof

:wait_for_service
setlocal
set "url=%~1"
set "service_name=%~2"
set attempt=1
set max_attempts=60

:check_loop
ping -n 2 localhost >nul
curl -s "%url%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] %service_name% is ready!
    endlocal
    goto :eof
)

if %attempt%==%max_attempts% (
    echo [WARNING] %service_name% may not be fully ready yet
    endlocal
    goto :eof
)

if %attempt%==10 (
    echo [INFO] Still waiting for %service_name%... (attempt %attempt%/%max_attempts%)
)
if %attempt%==30 (
    echo [INFO] Still waiting for %service_name%... (attempt %attempt%/%max_attempts%)
)
if %attempt%==50 (
    echo [INFO] Still waiting for %service_name%... (attempt %attempt%/%max_attempts%)
)

set /a attempt+=1
goto check_loop
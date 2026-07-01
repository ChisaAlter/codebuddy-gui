@echo off
title CodeBuddy GUI - Full Test
color 0A

echo ================================================
echo  CodeBuddy GUI - Full Feature Test
echo ================================================
echo.

echo [1/5] Killing existing processes...
taskkill /f /im node.exe /im electron.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/5] Starting Mock CodeBuddy API Server...
start "MockAPI" cmd /k "node C:\Users\48818\Documents\CodeBuddyGUI\mock-server.cjs"
timeout /t 2 /nobreak >nul

echo [3/5] Testing API endpoints...
echo GET /api/v1/health
curl -s http://127.0.0.1:7890/api/v1/health 2>nul && echo [OK] || echo [FAIL]

echo GET /api/v1/sessions
curl -s http://127.0.0.1:7890/api/v1/sessions 2>nul && echo [OK] || echo [FAIL]

echo GET /api/v1/workers
curl -s http://127.0.0.1:7890/api/v1/workers 2>nul && echo [OK] || echo [FAIL]

echo GET /api/v1/daemon/status
curl -s http://127.0.0.1:7890/api/v1/daemon/status 2>nul && echo [OK] || echo [FAIL]

echo GET /api/v1/metrics
curl -s http://127.0.0.1:7890/api/v1/metrics 2>nul && echo [OK] || echo [FAIL]

echo GET /api/v1/plugins
curl -s http://127.0.0.1:7890/api/v1/plugins 2>nul && echo [OK] || echo [FAIL]

echo.
echo [4/5] Starting Electron GUI...
start "ElectronGUI" cmd /k "cd C:\Users\48818\Documents\CodeBuddyGUI && npx electron ."

echo.
echo [5/5] Waiting for Electron to load...
timeout /t 5 /nobreak >nul

echo.
echo ================================================
echo  Test Complete!
echo ================================================
echo.
echo Check the Electron GUI window.
echo.
echo Screenshot will be taken in 5 seconds...
timeout /t 5 /nobreak >nul

REM Screenshot via PowerShell
powershell -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $bitmap = [System.Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size); $bitmap.Save('C:\Users\48818\Documents\CodeBuddyGUI\test-result.png'); $graphics.Dispose(); $bitmap.Dispose(); Write-Host 'Screenshot saved to C:\Users\48818\Documents\CodeBuddyGUI\test-result.png'"

echo.
echo Done! Check test-result.png for the GUI state.
pause

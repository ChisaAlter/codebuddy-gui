@echo off
echo Starting CodeBuddy GUI...
echo.

start "CodeBuddy API" cmd /k "codebuddy --serve --port 7890"

timeout /t 3 /nobreak >nul

start "Vite Dev" cmd /k "cd C:\Users\48818\Documents\CodeBuddyGUI && npx vite --port 8080"

timeout /t 2 /nobreak >nul

start "Electron GUI" cmd /k "cd C:\Users\48818\Documents\CodeBuddyGUI && npx electron ."

echo.
echo All three processes started in separate windows.
echo Close this window will not stop them.

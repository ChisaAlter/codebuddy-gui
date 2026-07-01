# Full automated test for CodeBuddy GUI
# Run this in PowerShell (Run as Administrator)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectDir = "C:\Users\48818\Documents\CodeBuddyGUI"
$electronExe = "$projectDir\node_modules\electron\dist\electron.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CodeBuddy GUI - Full API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Cleanup existing processes
Write-Host "[1/5] Cleaning up existing processes..." -ForegroundColor Yellow
Stop-Process -Name electron -ErrorAction SilentlyContinue
Stop-Process -Name node -ErrorAction SilentlyContinue
Start-Sleep 2
Write-Host "  Cleanup complete." -ForegroundColor Green

# Step 2: Start Vite dev server
Write-Host "`n[2/5] Starting Vite dev server..." -ForegroundColor Yellow
$ viteJob = Start-Job -ScriptBlock {
    Set-Location $projectDir
    npx vite --port 8080
} -Name "ViteDev"
Start-Sleep 3
Write-Host "  Vite job started (ID: $($viteJob.Id))"

# Step 3: Mock CodeBuddy API (real API server)
Write-Host "`n[3/5] Starting Mock CodeBuddy API server..." -ForegroundColor Yellow
$mockJob = Start-Job -ScriptBlock {
    Set-Location $projectDir
    node mock-server.cjs
} -Name "MockAPI"
Start-Sleep 2

# Test API connectivity
try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:7890/api/v1/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "  API Health: OK (HTTP $($health.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  API Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test API endpoints
$endpoints = @("/api/v1/health", "/api/v1/sessions", "/api/v1/workers", "/api/v1/daemon/status")
foreach ($ep in $endpoints) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:7890$ep" -UseBasicParsing -TimeoutSec 5
        Write-Host "  Test OK: $ep (HTTP $($r.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "  Test FAIL: $ep" -ForegroundColor Red
    }
}

# Step 4: Start Electron
Write-Host "`n[4/5] Starting Electron GUI..." -ForegroundColor Yellow
$electron = Start-Process -FilePath $electronExe -ArgumentList $projectDir -PassThru -WindowStyle Normal -WorkingDirectory $projectDir
Write-Host "  Electron PID: $($electron.Id)"

Write-Host "`n  Waiting 6 seconds for Electron to load..." -ForegroundColor Yellow
Start-Sleep 6

# Step 5: Take screenshot
Write-Host "`n[5/5] Taking screenshot..." -ForegroundColor Yellow
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$savePath = "$projectDir\test-screenshot.png"
$bitmap.Save($savePath)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "  Screenshot saved to: $savePath" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cleanup prompt
Write-Host "Press any key to stop all services..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
$electron | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-Job $viteJob -ErrorAction SilentlyContinue
Remove-Job $viteJob -ErrorAction SilentlyContinue
Stop-Job $mockJob -ErrorAction SilentlyContinue
Remove-Job $mockJob -ErrorAction SilentlyContinue
Write-Host "Cleanup done."

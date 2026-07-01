Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "=== CodeBuddy GUI Test ===" -ForegroundColor Cyan

# Step 1: Kill existing
Write-Host "`n[1/5] Cleaning up..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -match "node|electron" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2

# Step 2: Start mock server (as background job)
Write-Host "[2/5] Starting Mock API..." -ForegroundColor Yellow
$mockScript = {
    Set-Location "C:\Users\48818\Documents\CodeBuddyGUI"
    node mock-server.cjs
}
$mockJob = Start-Job -ScriptBlock $mockScript
Start-Sleep 3

# Verify API
try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:7890/api/v1/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "  API Health: HTTP $($health.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "  API FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Test all endpoints
Write-Host "`n[3/5] Testing API Endpoints..." -ForegroundColor Yellow
$endpoints = @(
    "GET /api/v1/health",
    "GET /api/v1/sessions",
    "GET /api/v1/workers",
    "GET /api/v1/daemon/status",
    "GET /api/v1/metrics",
    "GET /api/v1/plugins",
    "GET /api/v1/scheduled-tasks",
    "GET /api/v1/traces"
)

foreach ($ep in $endpoints) {
    $parts = $ep -split ' '
    $method = $parts[0]
    $path = $parts[1]
    try {
        $url = "http://127.0.0.1:7890$path"
        $r = Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing -TimeoutSec 5
        Write-Host "  $($ep): HTTP $($r.StatusCode) - OK" -ForegroundColor Green
    } catch {
        Write-Host "  $($ep): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Step 4: Start Electron
Write-Host "`n[4/5] Starting Electron GUI..." -ForegroundColor Yellow
Set-Location "C:\Users\48818\Documents\CodeBuddyGUI"
$electron = Start-Process -FilePath "npx" -ArgumentList "electron.exe", "." -PassThru -WindowStyle Normal

Write-Host "  Waiting for Electron..." -ForegroundColor Yellow
Start-Sleep 5

# Step 5: Take screenshot
Write-Host "`n[5/5] Saving screenshot..." -ForegroundColor Yellow
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$savePath = "C:\Users\48818\Documents\CodeBuddyGUI\test-result.png"
$bitmap.Save($savePath)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Screenshot: $savePath"
Write-Host "Electron PID: $($electron.Id)"

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
$electron | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-Job $mockJob -ErrorAction SilentlyContinue
Remove-Job $mockJob -ErrorAction SilentlyContinue

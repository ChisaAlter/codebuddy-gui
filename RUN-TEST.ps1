Add-Type -AssemblyName System.Windows.Forms

Write-Host "=== CodeBuddy GUI Full API Test ===" -ForegroundColor Cyan

# Start mock server
Write-Host "`n[1/4] Starting Mock API Server..." -ForegroundColor Yellow
$mockJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\48818\Documents\CodeBuddyGUI"
    node mock-server.cjs
}
Start-Sleep 2

# Test API endpoints
Write-Host "`n[2/4] Testing API Endpoints..." -ForegroundColor Yellow
$headers = @{"X-CodeBuddy-Request"="1"}

$tests = @(
    @{ Name = "Health";      Method = "GET";  Path = "/api/v1/health" },
    @{ Name = "Sessions";    Method = "GET";  Path = "/api/v1/sessions" },
    @{ Name = "Workers";     Method = "GET";  Path = "/api/v1/workers" },
    @{ Name = "Daemon";      Method = "GET";  Path = "/api/v1/daemon/status" },
    @{ Name = "Metrics";     Method = "GET";  Path = "/api/v1/metrics" },
    @{ Name = "Plugins";     Method = "GET";  Path = "/api/v1/plugins" },
    @{ Name = "Tasks";       Method = "GET";  Path = "/api/v1/scheduled-tasks" },
    @{ Name = "Traces";      Method = "GET";  Path = "/api/v1/traces" },
    @{ Name = "Files(path)"; Method = "POST"; Path = "/api/v1/fs/list"; Body = '{"path":"."}' }
)

foreach ($test in $tests) {
    try {
        $uri = "http://127.0.0.1:7890$($test.Path)"
        if ($test.Method -eq "GET") {
            $r = Invoke-WebRequest -Uri $uri -Headers $headers -UseBasicParsing -TimeoutSec 5
        } else {
            $r = Invoke-WebRequest -Uri $uri -Method POST -Headers $headers -Body $test.Body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
        }
        Write-Host "  ✓ $($test.Name): HTTP $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $($test.Name): ERROR $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Start Electron
Write-Host "`n[3/4] Starting Electron GUI..." -ForegroundColor Yellow
Set-Location "C:\Users\48818\Documents\CodeBuddyGUI"
$electronProcess = Start-Process -FilePath "npx" -ArgumentList "electron", "." -PassThru

Write-Host "`n[4/4] Waiting 5s for Electron to load..." -ForegroundColor Yellow
Start-Sleep 5

# Capture page
Write-Host "`n=== Electron Window State ===" -ForegroundColor Cyan
Get-Process electron | Format-Table Id, ProcessName

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
$bitmap.Save('C:\Users\48818\Documents\CodeBuddyGUI\test-result.png')
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "`nScreenshot saved to: C:\Users\48818\Documents\CodeBuddyGUI\test-result.png" -ForegroundColor Cyan

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host "Electron PID: $($electronProcess.Id)"
Write-Host "Check the Electron window. Close it when done."

# Keep mock server running
Write-Host "`nMock server is still running. Press Ctrl+C to stop."
Wait-Process -Id $electronProcess.Id -ErrorAction SilentlyContinue

# Cleanup
Stop-Job $mockJob -ErrorAction SilentlyContinue
Remove-Job $mockJob -ErrorAction SilentlyContinue
Write-Host "Done."

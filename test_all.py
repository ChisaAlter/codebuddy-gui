import subprocess
import time
import os

BASE = r'C:\Users\48818\Documents\CodeBuddyGUI'

print("=== CodeBuddy GUI Full Test ===")

# Step 1: Kill existing
print("\n[1/5] Cleaning up...")
subprocess.run(['taskkill', '/f', '/im', 'electron.exe', '/im', 'node.exe', '/t'], 
               capture_output=True, timeout=5)
time.sleep(2)

# Step 2: Start mock server
print("[2/5] Starting Mock API...")
mock = subprocess.Popen(
    ['node', os.path.join(BASE, 'mock-server.cjs')],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    cwd=BASE
)
time.sleep(3)

# Verify API
print("  Checking API...")
try:
    import urllib.request
    req = urllib.request.Request('http://127.0.0.1:7890/api/v1/health')
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"  API Health: HTTP {resp.status}")
except Exception as e:
    print(f"  API Error: {e}")

# Step 3: Test endpoints
print("\n[3/5] Testing API Endpoints...")
endpoints = ['/api/v1/health', '/api/v1/sessions', '/api/v1/workers', 
             '/api/v1/daemon/status', '/api/v1/metrics', '/api/v1/plugins',
             '/api/v1/scheduled-tasks', '/api/v1/traces']
for ep in endpoints:
    try:
        req = urllib.request.Request(f'http://127.0.0.1:7890{ep}')
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read().decode()
            print(f"  {ep}: HTTP {resp.status} - {data[:60]}...")
    except Exception as e:
        print(f"  {ep}: ERROR {e}")

# Step 4: Start Electron
print("\n[4/5] Starting Electron GUI...")
electron = subprocess.Popen(
    ['npx', 'electron', '.'],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    cwd=BASE
)
print("  Waiting 5s for Electron...")
time.sleep(5)

# Step 5: Take screenshot
print("\n[5/5] Taking screenshot...")
ps_cmd = '''
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
$bitmap.Save("C:\\Users\\48818\\Documents\\CodeBuddyGUI\\test-result.png")
$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Screenshot saved"
'''
result = subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-Command', ps_cmd], 
                       capture_output=True, text=True, timeout=15)
print(f"  Screenshot: {result.stdout.strip()}")

# Step 6: Read Electron console output
print("\n[6/6] Reading Electron output...")
try:
    # Electron may have already exited
    electron.wait(timeout=2)
except subprocess.TimeoutExpired:
    pass

if electron.stdout:
    try:
        out = electron.stdout.read().decode(errors='replace')
        print("  Electron stdout:")
        print("  " + out[:1500].replace("\n", "\n  "))
    except:
        pass

print("\n=== Test Complete ===")
print("Check: C:\\Users\\48818\\Documents\\CodeBuddyGUI\\test-result.png")

# Cleanup
print("\nCleaning up...")
electron.kill()
mock.kill()
print("Done.")

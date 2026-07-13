const { spawnSync } = require('child_process');
const path = require('path');

const candidates = process.platform === 'win32'
  ? ['pwsh.exe', 'powershell.exe']
  : ['pwsh'];

let shell = null;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (!probe.error && probe.status === 0) {
    shell = candidate;
    break;
  }
}

if (!shell) {
  console.error('PowerShell is required to prepare Windows release assets.');
  process.exit(1);
}

const releaseScript = path.join(__dirname, 'prepare-release.ps1');
const result = spawnSync(shell, [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  releaseScript,
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(`Unable to start ${shell}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

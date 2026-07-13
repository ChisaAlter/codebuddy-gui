const { spawn } = require('child_process');

const builderCli = require.resolve('electron-builder/cli.js');
const builderArgs = [builderCli, ...process.argv.slice(2), '--publish', 'never'];
const maxAttempts = process.platform === 'win32' ? 2 : 1;
const transientPattern = /(?:rcedit|Unable to commit changes|EBUSY|EPERM)/i;

function appendTail(current, chunk, maxLength = 256 * 1024) {
  const combined = current + String(chunk || '');
  return combined.length > maxLength ? combined.slice(-maxLength) : combined;
}

function runBuilder() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, builderArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      output = appendTail(output, chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      output = appendTail(output, chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runBuilder();
    if (result.code === 0) return;
    const transient = transientPattern.test(result.output);
    if (!transient || attempt === maxAttempts) process.exit(result.code);
    process.stderr.write(`\nElectron packaging hit a transient Windows resource-write failure. Retrying once in 2 seconds (${attempt + 1}/${maxAttempts})...\n`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((error) => {
  console.error(`Unable to start electron-builder: ${error?.message || error}`);
  process.exit(1);
});

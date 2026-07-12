#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const supervisorArgs = process.argv.slice(2);
if (supervisorArgs.length < 2 || supervisorArgs.length > 64) {
  process.stderr.write('Windows Job supervisor host received an invalid argument count\n');
  process.exit(2);
}

let stdoutOpen = true;
let stderrOpen = true;
process.stdout.on('error', () => {
  stdoutOpen = false;
});
process.stderr.on('error', () => {
  stderrOpen = false;
});

const supervisor = spawn('powershell.exe', supervisorArgs, {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  windowsHide: true,
  detached: false,
  env: process.env,
});

supervisor.stdout.on('data', (chunk) => {
  if (stdoutOpen) process.stdout.write(chunk);
});
supervisor.stderr.on('data', (chunk) => {
  if (stderrOpen) process.stderr.write(chunk);
});
supervisor.once('error', (error) => {
  if (stderrOpen) process.stderr.write(`Windows Job supervisor host spawn failed: ${error.code || 'spawn-error'}\n`);
  process.exit(2);
});
supervisor.once('exit', (code) => {
  process.exit(Number.isInteger(code) ? code : 2);
});

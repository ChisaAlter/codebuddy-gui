#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const role = argument('role');
const fixtureDir = path.resolve(argument('fixture-dir') || '');

if (!role || !fixtureDir) {
  process.stderr.write('fixture requires --role and --fixture-dir\n');
  process.exit(2);
}

fs.mkdirSync(fixtureDir, { recursive: true });

function fixturePath(name) {
  return path.join(fixtureDir, name);
}

function writeMarker(name, details = {}) {
  const target = fixturePath(`${name}.json`);
  const temporary = fixturePath(`.${name}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify({ pid: process.pid, role, ...details })}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function spawnFixture(childRole) {
  return spawn(
    process.execPath,
    [__filename, '--role', childRole, '--fixture-dir', fixtureDir],
    {
      cwd: fixtureDir,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
      detached: true,
    },
  );
}

let finished = false;
const timers = new Set();

function schedule(callback, delay) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
}

function finish(code = 0) {
  if (finished) return;
  finished = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  process.exit(code);
}

function waitForFile(name, callback) {
  const poll = () => {
    if (finished) return;
    if (fs.existsSync(fixturePath('shutdown'))) {
      finish(0);
      return;
    }
    if (fs.existsSync(fixturePath(name))) {
      callback();
      return;
    }
    schedule(poll, 20);
  };
  poll();
}

function stayAlive(markerName) {
  writeMarker(markerName);
  const poll = () => {
    if (fs.existsSync(fixturePath('shutdown'))) {
      finish(0);
      return;
    }
    schedule(poll, 25);
  };
  poll();
}

process.on('uncaughtException', (error) => {
  try {
    writeMarker(`${role}-error`, { code: error?.code || 'fixture-error' });
  } finally {
    finish(3);
  }
});

switch (role) {
  case 'late-root':
    writeMarker('late-root-ready');
    waitForFile('spawn-child', () => {
      const child = spawnFixture('late-child');
      writeMarker('late-root-spawned-child', { childPid: child.pid });
      child.once('error', (error) => writeMarker('late-child-spawn-error', { code: error?.code || 'spawn-error' }));
      child.once('exit', (code) => writeMarker('late-child-early-exit', { code }));
      waitForFile('late-child-ready.json', () => schedule(() => finish(0), 40));
    });
    break;
  case 'late-child':
    writeMarker('late-child-ready');
    waitForFile('spawn-grandchild', () => {
      const grandchild = spawnFixture('late-grandchild');
      writeMarker('late-child-spawned-grandchild', { grandchildPid: grandchild.pid });
      stayAlive('late-child-staying');
    });
    break;
  case 'late-grandchild':
    stayAlive('late-grandchild-ready');
    break;
  case 'hard-root': {
    const child = spawnFixture('hard-child');
    writeMarker('hard-root-ready', { childPid: child.pid });
    stayAlive('hard-root-staying');
    break;
  }
  case 'hard-child': {
    const grandchild = spawnFixture('hard-grandchild');
    writeMarker('hard-child-ready', { grandchildPid: grandchild.pid });
    stayAlive('hard-child-staying');
    break;
  }
  case 'hard-grandchild':
    stayAlive('hard-grandchild-ready');
    break;
  case 'survivor':
    stayAlive('survivor-ready');
    break;
  case 'eof-root':
    stayAlive('eof-root-ready');
    break;
  case 'env-root':
    writeMarker('env-root-ready', {
      sentinelPresent: process.env.CODEBUDDY_E2E_SENTINEL === 'present-only-in-env',
    });
    stayAlive('env-root-staying');
    break;
  default:
    process.stderr.write(`unknown fixture role: ${role}\n`);
    process.exit(2);
}

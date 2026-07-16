#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  cleanupOwned,
  cleanupRuntimeDir,
  connectCdp,
  createOverallWatchdog,
  createOwnershipCleanupEvidence,
  createRuntimeLayout,
  createSingleFinalizer,
  finalizeHarnessRun,
  finalizeUnsafeHarnessFailure,
  driveByRole,
  driveRoutes,
  findRendererTarget,
  findStartupLog,
  launchDesktop,
  parsePositiveInteger,
  requireUsableCodeBuddyStartup,
  seedProductState,
  throwIfAborted,
  waitForRendererValue,
  waitForVisibleSettingValue,
} = require('./e2e-driver.cjs');
const {
  createTaskRunLayout,
  safeSegment,
  sanitizeText,
  writeContactSheet,
  writeTaskEvidence,
} = require('./evidence-writer.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const runStamp = safeSegment(process.env.CODEBUDDY_E2E_RUN_ID || new Date().toISOString(), 'run');
const evidenceRoot = path.join(projectRoot, '.omo', 'evidence', 'task-1-runs');
const screenshotRoot = path.join(projectRoot, '.omo', 'evidence', 'task-1-screenshots');
const runLayout = createTaskRunLayout({
  evidenceRoot,
  screenshotRoot,
  taskId: 'task-1',
  runLabel: 'unpackaged-renderer',
  requestedId: runStamp,
});
const runtimeOwnership = createRuntimeLayout({
  projectRoot,
  runStamp: runLayout.runName,
  label: 'renderer',
});
const { runtimeRoot, runtimeDir, userDataDir } = runtimeOwnership;
const screenshotDir = runLayout.screenshotDir;
const runnerProfile =
  'dedicated authenticated test profile; CodeBuddy backend session state may persist between runs';
const results = [];
const routeScreenshots = [];
const startedAtMs = Date.now();
let launched = null;
let ownershipController = null;
let client = null;
let startup = null;
let target = null;
let contactSheet = null;
let activeSignal = null;
let configuredChatRounds = null;

function check(name, ok, detail = '') {
  throwIfAborted(activeSignal, 'renderer result mutation aborted');
  const result = { name, ok: Boolean(ok), detail: sanitizeText(detail) };
  results.push(result);
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${name}${result.detail ? ` — ${result.detail}` : ''}`);
  return result.ok;
}

function wait(ms, signal) {
  throwIfAborted(signal, `renderer wait ${ms}ms aborted`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      try {
        throwIfAborted(signal, `renderer wait ${ms}ms aborted`);
      } catch (error) {
        reject(error);
      }
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function startupOptions() {
  return {
    projectRoot,
    userDataDir,
    appDataDir: process.env.APPDATA,
    appName: 'codebuddy-gui',
    packaged: false,
    strictUserDataOnly: true,
  };
}

async function waitForStartup(pattern, timeoutMs, description, signal) {
  throwIfAborted(signal, `${description} aborted`);
  const deadline = Date.now() + timeoutMs;
  let last = findStartupLog(startupOptions());
  do {
    throwIfAborted(signal, `${description} aborted`);
    last = findStartupLog(startupOptions());
    const fresh = last.path && fs.statSync(last.path).mtimeMs >= startedAtMs - 1000;
    pattern.lastIndex = 0;
    if (fresh && pattern.test(last.text)) return last;
    if (Date.now() < deadline) await wait(250, signal);
  } while (Date.now() < deadline);
  throw new Error(
    `${description} did not appear in a fresh startup log within ${timeoutMs}ms; candidates=${last.candidates.join(', ')}`,
  );
}

function cliVersion() {
  const run =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'codebuddy --version'], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      : spawnSync('codebuddy', ['--version'], {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
  return (run.stdout || run.stderr || '').trim() || `unavailable(exit=${run.status})`;
}

function requestedDebugPort() {
  if (!process.env.CODEBUDDY_E2E_DEBUG_PORT) return undefined;
  const value = Number(process.env.CODEBUDDY_E2E_DEBUG_PORT);
  if (!Number.isInteger(value))
    throw new Error(`CODEBUDDY_E2E_DEBUG_PORT must be an integer, received ${process.env.CODEBUDDY_E2E_DEBUG_PORT}`);
  return value;
}

function injectedControl() {
  const role = process.env.CODEBUDDY_E2E_EXPECT_ROLE;
  const name = process.env.CODEBUDDY_E2E_EXPECT_NAME;
  return role && name ? { role, name, timeoutMs: Number(process.env.CODEBUDDY_E2E_EXPECT_TIMEOUT_MS) || 2000 } : null;
}


async function sendChatRound(round, signal) {
  throwIfAborted(signal, `chat round ${round} aborted`);
  const message = `E2E round ${round} ${Date.now()} — reply OK`;
  const assistantCountBefore = await client.evaluate(
    `document.querySelectorAll('button[title="复制到剪贴板"]').length`,
  );
  await waitForRendererValue(client, `!document.querySelector('button[title="停止生成"]')`, {
    timeoutMs: 120000,
    describe: `chat round ${round} ready state`,
    signal,
  });
  await driveByRole(client, {
    role: 'textbox',
    name: '从一个想法开始...',
    action: 'fill',
    value: message,
    timeoutMs: 15000,
    signal,
  });
  await driveByRole(client, {
    role: 'button',
    name: '发送',
    action: 'invoke',
    timeoutMs: 15000,
    signal,
  });
  const visible = await waitForRendererValue(client, `document.body.innerText.includes(${JSON.stringify(message)})`, {
    timeoutMs: 15000,
    describe: `chat round ${round} visible user message`,
    signal,
  });
  check(`chat round ${round} rendered the user message`, visible === true, message);
  let assistantCountAfter;
  try {
    assistantCountAfter = await waitForRendererValue(
      client,
      `document.querySelectorAll('button[title="复制到剪贴板"]').length`,
      {
        timeoutMs: 120000,
        intervalMs: 500,
        describe: `chat round ${round} visible assistant response`,
        accept: (value) => Number(value) > Number(assistantCountBefore),
        signal,
      },
    );
  } catch (error) {
    const diagnostic = await client.evaluate(`(() => ({
      stopVisible: !!document.querySelector('button[title="停止生成"]'),
      copyButtons: document.querySelectorAll('button[title="复制到剪贴板"]').length,
      bodyTail: document.body.innerText.slice(-1200)
    }))()`);
    throw new Error(`${error.message}; renderer diagnostic=${JSON.stringify(diagnostic)}`);
  }
  check(
    `chat round ${round} rendered a completed assistant response`,
    assistantCountAfter > assistantCountBefore,
    `${assistantCountBefore} -> ${assistantCountAfter}`,
  );
  await waitForRendererValue(client, `!document.querySelector('button[title="停止生成"]')`, {
    timeoutMs: 120000,
    intervalMs: 500,
    describe: `chat round ${round} completion`,
    signal,
  });
}

async function verifyStopControlUiFlow(signal) {
  throwIfAborted(signal, 'stop-control flow aborted');
  const message = `E2E stop-control ${Date.now()} — explain slowly`;
  await driveByRole(client, {
    role: 'textbox',
    name: '从一个想法开始...',
    action: 'fill',
    value: message,
    timeoutMs: 15000,
    signal,
  });
  await driveByRole(client, {
    role: 'button',
    name: '发送',
    action: 'invoke',
    timeoutMs: 15000,
    signal,
  });
  const stopDispatch = await driveByRole(client, {
    role: 'button',
    name: '停止生成',
    action: 'invoke',
    timeoutMs: 15000,
    signal,
  });
  check(
    'visible stop control received a deterministic invoke',
    stopDispatch.action === 'invoke',
    stopDispatch.action || '<none>',
  );
  const leftStreamingState = await waitForRendererValue(
    client,
    `!document.querySelector('button[title="停止生成"]')`,
    {
      timeoutMs: 15000,
      describe: 'stop-control UI streaming-state exit',
      signal,
    },
  );
  check(
    'visible stop control was invoked and UI left streaming state',
    leftStreamingState === true,
    'backend cancellation semantics NOT verified / baseline-open (Task 5)',
  );
}

async function verifySidebarShortcut(signal) {
  throwIfAborted(signal, 'sidebar shortcut flow aborted');
  const before = await client.evaluate(`getComputedStyle(document.querySelector('aside[role="navigation"]')).width`);
  const dispatchShortcut = () => driveByRole(client, {
    role: 'textbox',
    name: '从一个想法开始...',
    action: 'press',
    key: 'b',
    ctrlKey: true,
    timeoutMs: 15000,
    signal,
  });

  const shortcutDispatch = await dispatchShortcut();
  check('Ctrl+B shortcut dispatched from the active chat composer', shortcutDispatch.action === 'press');

  const collapsed = await waitForRendererValue(
    client,
    `getComputedStyle(document.querySelector('aside[role="navigation"]')).width`,
    {
      timeoutMs: 5000,
      describe: 'Ctrl+B collapsed sidebar width',
      accept: (value) => value && value !== before,
      signal,
    },
  );
  check('Ctrl+B collapses the visible sidebar', collapsed !== before, `${before} -> ${collapsed}`);

  await dispatchShortcut();
  const restored = await waitForRendererValue(
    client,
    `getComputedStyle(document.querySelector('aside[role="navigation"]')).width`,
    {
      timeoutMs: 5000,
      describe: 'Ctrl+B restored sidebar width',
      accept: (value) => value === before,
      signal,
    },
  );
  check('Ctrl+B restores the visible sidebar', restored === before, `${collapsed} -> ${restored}`);
}
async function main(signal) {
  throwIfAborted(signal, 'renderer main aborted');
  configuredChatRounds = parsePositiveInteger(process.env.CODEBUDDY_E2E_CHAT_ROUNDS, {
    name: 'CODEBUDDY_E2E_CHAT_ROUNDS',
    defaultValue: 10,
  });
  console.log('=== unpackaged renderer behavior test ===');
  check('Node native WebSocket is available', typeof globalThis.WebSocket === 'function', process.version);
  check('production renderer build exists', fs.existsSync(path.join(projectRoot, 'out', 'dist', 'index.html')));
  check('Electron executable exists', fs.existsSync(electronExe), electronExe);
  if (results.some((result) => !result.ok)) return;

  throwIfAborted(signal, 'renderer profile creation aborted');
  fs.mkdirSync(userDataDir, { recursive: true });
  seedProductState({ userDataDir, projectRoot });
  launched = await launchDesktop({
    executable: electronExe,
    appArgs: ['.'],
    projectRoot,
    userDataDir,
    runtimeRoot,
    runtimeDir,
    runtimeOwnership,
    debugPort: requestedDebugPort(),
    signal,
    onOwnershipController(controller) {
      ownershipController = controller;
    },
  });
  launched.process.stdout?.on('data', (chunk) => console.log(`[electron] ${sanitizeText(String(chunk).trim())}`));
  launched.process.stderr?.on('data', (chunk) =>
    console.log(`[electron:err] ${sanitizeText(String(chunk).trim())}`),
  );
  console.log(`[context] rootPid=${launched.rootPid} debugPort=${launched.debugPort}`);

  startup = await waitForStartup(/CodeBuddy runtime ready project=\S+ port=\d+\b/, 45000, 'CodeBuddy runtime ready', signal);
  check(
    'fresh startup log is in app.getPath(userData)',
    startup.source === 'userData',
    startup.path ? 'isolated userData/electron-startup.log' : 'not found',
  );
  const startupContract = requireUsableCodeBuddyStartup(startup.text);
  check('CodeBuddy runtime manager reported ready', startupContract.state === 'ready', `port=${startupContract.port}`);
  startup = await waitForStartup(
    /renderer ready=true|dev server unreachable, falling back to/,
    50000,
    'renderer load marker',
    signal,
  );

  target = await findRendererTarget({
    port: launched.debugPort,
    expectedUrl: (url) =>
      /^http:\/\/(?:localhost:5173|127\.0\.0\.1:\d+\/index\.html)$/.test(String(url || '').replace(/\/$/, '')),
    timeoutMs: 30000,
    signal,
  });
  check('CDP selected the unpackaged CodeBuddy renderer', true, target.url);
  client = await connectCdp(target, { signal });
  const identity = await waitForRendererValue(
    client,
    `(() => ({
    href: location.href,
    rootChildren: document.querySelectorAll('#root > *').length,
    userAgent: navigator.userAgent
  }))()`,
    {
      timeoutMs: 20000,
      describe: 'React renderer identity',
      accept: (value) => value?.rootChildren > 0 && /Electron\//.test(value.userAgent || ''),
      signal,
    },
  );
  check('connected CDP target is the Electron renderer', identity.rootChildren > 0, identity.href);

  const expectedControl = injectedControl();
  if (expectedControl && process.env.CODEBUDDY_E2E_ONLY_EXPECTED_CONTROL === '1') {
    await driveByRole(client, { ...expectedControl, action: 'assert', signal });
    return;
  }

  await driveByRole(client, {
    role: 'button',
    name: '设置',
    action: 'invoke',
    root: 'aside[role="navigation"]',
    timeoutMs: 15000,
    signal,
  });
  const initialSessionId = await waitForVisibleSettingValue(client, '会话 ID', { timeoutMs: 60000, signal });
  check('initial session readiness is visible before New chat', Boolean(initialSessionId), initialSessionId);
  await driveByRole(client, { role: 'button', name: '新对话', action: 'invoke', timeoutMs: 15000, signal });
  await driveByRole(client, {
    role: 'button',
    name: '设置',
    action: 'invoke',
    root: 'aside[role="navigation"]',
    timeoutMs: 15000,
    signal,
  });
  const replacementSessionId = await waitForVisibleSettingValue(client, '会话 ID', {
    timeoutMs: 60000,
    accept: (value) => Boolean(value) && value !== initialSessionId,
    signal,
  });
  check(
    'New chat exposes a distinct ready session ID before chat send',
    replacementSessionId !== initialSessionId,
    `${initialSessionId} -> ${replacementSessionId}`,
  );
  await driveByRole(client, {
    role: 'button',
    name: '对话',
    action: 'invoke',
    root: 'aside[role="navigation"]',
    timeoutMs: 15000,
    signal,
  });
  await driveByRole(client, { role: 'textbox', name: '从一个想法开始...', timeoutMs: 15000, signal });
  let connected;
  try {
    connected = await waitForRendererValue(
      client,
      `document.querySelector('[role="banner"]')?.innerText?.includes('已连接') || false`,
      {
        timeoutMs: 60000,
        intervalMs: 250,
        describe: 'visible CodeBuddy connected state before chat send',
        signal,
      },
    );
  } catch (error) {
    const diagnostic = await client.evaluate(`(() => ({
      status: document.querySelector('[role="banner"]')?.innerText || '',
      alert: document.querySelector('[role="alert"]')?.innerText || '',
      bodyTail: document.body.innerText.slice(-1200)
    }))()`);
    throw new Error(`${error.message}; renderer diagnostic=${JSON.stringify(diagnostic)}`);
  }
  check('status bar reports a visible connected state before chat send', connected === true);

  for (let round = 1; round <= configuredChatRounds; round += 1) {
    await sendChatRound(round, signal);
  }
  await verifyStopControlUiFlow(signal);
  await verifySidebarShortcut(signal);

  const routeResults = await driveRoutes(client, {
    screenshotDir,
    expectedControl,
    signal,
    onRoute(result) {
      check(
        `route ${result.route} exposes ${result.expected.role} ${JSON.stringify(result.expected.name)}`,
        (result.state.hash === `#/${result.route}` || (result.route === 'chat' && !result.state.hash))
          && result.control.ok,
        result.screenshot?.path || '',
      );
      if (result.screenshot) {
        routeScreenshots.push({
          name: result.route,
          path: result.screenshot.path,
          sha256: result.screenshot.sha256,
        });
      }
    },
  });
  check(
    'all routes were reached by clicking sidebar controls',
    routeResults.length === 19,
    `routes=${routeResults.length}`,
  );

  await driveByRole(client, {
    role: 'button',
    name: '设置',
    action: 'invoke',
    root: 'aside[role="navigation"]',
    timeoutMs: 15000,
    signal,
  });
  await driveByRole(client, { role: 'button', name: '亮色', action: 'invoke', timeoutMs: 15000, signal });
  const light = await waitForRendererValue(client, `document.documentElement.dataset.theme`, {
    timeoutMs: 5000,
    describe: 'light theme visible state',
    accept: (value) => value === 'light',
    signal,
  });
  check('Light theme button changes document theme', light === 'light');
  await driveByRole(client, { role: 'button', name: '暗色', action: 'invoke', timeoutMs: 5000, signal });

  throwIfAborted(signal, 'renderer CSP check aborted');
  const csp = await client.evaluate(`(async () => {
    const response = await fetch(location.href, { cache: 'no-store' });
    return response.headers.get('content-security-policy') || '';
  })()`);
  check(
    'renderer response carries the real CSP header',
    typeof csp === 'string' && csp.includes("default-src 'self'"),
    csp.slice(0, 120),
  );

  throwIfAborted(signal, 'renderer contact sheet aborted');
  contactSheet = writeContactSheet({
    screenshots: routeScreenshots,
    outputPath: path.join(screenshotDir, 'contact-sheet.svg'),
    columns: 3,
  });
  check('route contact sheet saved', contactSheet.screenshots === 19, contactSheet.path);
}

async function finish(error) {
  if (error) {
    console.error(sanitizeText(error.stack || error.message || error));
    check('unpackaged renderer harness completed without exception', false, error.message || String(error));
  }
  if (client) client.close();
  let cleanup = null;
  if (ownershipController) {
    try {
      cleanup = await ownershipController.close();
      check(
        'Windows Job cleanup verified zero active members',
        cleanup.ownershipBoundary?.jobClosed === true &&
          cleanup.remainingVerifiedProcesses?.verified === true &&
          cleanup.remainingVerifiedProcesses?.count === 0,
        `active=${cleanup.remainingVerifiedProcesses?.count ?? '<unverified>'}`,
      );
    } catch (cleanupError) {
      cleanup = ownershipController.snapshot?.() || null;
      if (cleanup) cleanup.errors = [{ error: sanitizeText(cleanupError.message || cleanupError) }];
      check('Windows Job cleanup verified zero active members', false, cleanupError.message);
    }
  } else if (launched?.rootPid) {
    let trackedProcesses = launched.rootIdentity ? [launched.rootIdentity] : [];
    try {
      trackedProcesses = await launched.processTracker.stop();
    } catch (trackerError) {
      check('owned process tracker stopped with a usable snapshot', false, trackerError.message);
    }
    try {
      cleanup = await cleanupOwned({ rootPid: launched.rootPid, trackedProcesses });
      check(
        'cleanup stayed within the owned process tree',
        cleanup.errors.length === 0,
        cleanup.errors.map((entry) => `${entry.pid}:${entry.error}`).join('; '),
      );
    } catch (cleanupError) {
      cleanup = { rootPid: launched.rootPid, errors: [{ pid: launched.rootPid, error: cleanupError.message }] };
      check('cleanup stayed within the owned process tree', false, cleanupError.message);
    }
  }
  const cleanupEvidence = createOwnershipCleanupEvidence({
    error,
    launched,
    ownershipController,
    cleanup,
    sanitize(value) {
      return sanitizeText(value, {
        redactionMap: { [runtimeRoot]: '[runtime-root]', [projectRoot]: '[project-root]' },
      });
    },
  });
  cleanupEvidence.launchCleanupErrors = cleanupEvidence.launchCleanupErrors || [];
  cleanupEvidence.ownershipBoundary = cleanupEvidence.ownershipBoundary || null;
  cleanupEvidence.remainingVerifiedProcesses = cleanupEvidence.remainingVerifiedProcesses || null;
  const startupText = startup?.text || findStartupLog(startupOptions()).text || '';
  try {
    await cleanupRuntimeDir({ runtimeOwnership, runtimeRoot, runtimeDir });
    check('isolated runtime profile removed after evidence capture', !fs.existsSync(runtimeDir));
  } catch (runtimeError) {
    check('isolated runtime profile removed after evidence capture', false, runtimeError.message);
  }
  const failCount = results.filter((result) => !result.ok).length;
  const startupLogEvidence = startup?.path
    ? 'isolated userData/electron-startup.log (removed after capture)'
    : '<not found>';
  const evidence = await writeTaskEvidence({
    runDir: runLayout.runDir,
    pathRoot: projectRoot,
    redactionMap: { [runtimeRoot]: '[runtime-root]', [projectRoot]: '[project-root]' },
    taskId: 'task-1',
    runLabel: 'unpackaged-renderer',
    timestamp: runStamp,
    status: failCount ? 'FAIL' : 'PASS',
    context: {
      node: process.version,
      electron: require(path.join(projectRoot, 'node_modules', 'electron', 'package.json')).version,
      codebuddyCli: cliVersion(),
      platform: `${process.platform}/${process.arch}`,
      runnerProfile,
      nativeWebSocket: typeof globalThis.WebSocket === 'function',
      debugPort: launched?.debugPort ?? '<not launched>',
      targetUrl: target?.url || '<not connected>',
      startupLog: startupLogEvidence,
      chatRounds: configuredChatRounds ?? '<invalid or unset>',
      stopControlScope: 'UI-only: backend cancellation semantics NOT verified / baseline-open (Task 5)',
      injectedControl: injectedControl() ? `${injectedControl().role}:${injectedControl().name}` : '<none>',
    },
    commands: [{ command: 'node scripts/test/e2e-renderer.cjs', exitCode: failCount ? 1 : 0 }],
    assertions: results,
    screenshots: [
      ...routeScreenshots.map((item) => ({
        ...item,
        analysis: `Sidebar navigation reached ${item.name}; route-specific control was visible.`,
      })),
      ...(contactSheet
        ? [
            {
              name: 'route contact sheet',
              path: contactSheet.path,
              analysis: 'All 19 route captures in sidebar order.',
            },
          ]
        : []),
    ],
    logs: [startupText.slice(-16000), ...(launched?.stderr || []).slice(-30)],
    cleanup: cleanupEvidence,
  });
  console.log('\n=== summary ===');
  console.log(`passed ${results.length - failCount}/${results.length}; failed ${failCount}`);
  console.log(`[evidence] ${evidence.reportPath}`);
  process.exitCode = failCount ? 1 : 0;
}

const watchdog = createOverallWatchdog({
  timeoutMs: Number(process.env.CODEBUDDY_E2E_WATCHDOG_MS || 15 * 60 * 1000),
  label: 'unpackaged renderer harness',
});
const finalize = createSingleFinalizer(finish);

async function runHarness() {
  let error = null;
  try {
    await watchdog.run(async (signal) => {
      activeSignal = signal;
      try {
        await main(signal);
      } finally {
        activeSignal = null;
      }
    });
  } catch (caught) {
    error = caught;
  } finally {
    watchdog.stop();
    const unsafeRedactionMap = Object.freeze({
      [runtimeRoot]: '[runtime-root]',
      [projectRoot]: '[project-root]',
    });
    const finalization = await finalizeHarnessRun({
      error,
      normalFinalizer: finalize,
      unsafeFinalizer: () => finalizeUnsafeHarnessFailure({
        error,
        ownershipController,
        runtimeOwnership,
        runtimeRoot,
        runtimeDir,
        evidenceOptions: {
          runDir: runLayout.runDir,
          pathRoot: projectRoot,
          redactionMap: unsafeRedactionMap,
          taskId: 'task-1',
          runLabel: 'unpackaged-renderer',
          timestamp: runStamp,
          context: Object.freeze({ harness: 'unpackaged-renderer' }),
          command: 'node scripts/test/e2e-renderer.cjs',
        },
        writeEvidence: writeTaskEvidence,
        sanitize(value) {
          return sanitizeText(value, { redactionMap: unsafeRedactionMap });
        },
      }),
    });
    if (finalization.branch === 'unsafe') {
      console.error(sanitizeText(error.stack || error.message || error));
      process.exitCode = 1;
      if (finalization.finalizerError) {
        console.error(
          sanitizeText(
            `unsafe finalization helper failed: ${finalization.finalizerError?.stack || finalization.finalizerError?.message || finalization.finalizerError}`,
            { redactionMap: unsafeRedactionMap },
          ),
        );
      }
      for (const stderrFailure of finalization.result?.stderrFailures || []) {
        console.error(sanitizeText(stderrFailure, { redactionMap: unsafeRedactionMap }));
      }
      setTimeout(() => process.exit(1), 1000);
      return;
    }
    if (finalization.finalizerError) {
      console.error(
        sanitizeText(
          finalization.finalizerError.stack || finalization.finalizerError.message || finalization.finalizerError,
        ),
      );
      process.exitCode = 1;
    }
  }
}

void runHarness();

const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

// ═══════════════════════════════════════════
// Mock CodeBuddy API Server (fallback)
// ═══════════════════════════════════════════
function startMockServer() {
  const PORT = 7890;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // Health
      if (url.pathname === '/api/v1/health') return send(200, { status: 'ok', uptime: 60 });

      // Sessions
      if (url.pathname === '/api/v1/sessions' && req.method === 'GET') {
        return send(200, {
          sessions: [
            { id: 'sess_001', name: 'Mock Session Alpha', lastActiveAt: 'Just now' },
            { id: 'sess_002', name: 'Code Review', lastActiveAt: '2 hours ago' },
            { id: 'sess_003', name: 'Debugging Help', lastActiveAt: '1 day ago' },
          ]
        });
      }

      if (url.pathname.match(/\/api\/v1\/sessions\/[^/]+\/messages/)) {
        return send(200, { messages: [
          { role: 'user', content: 'Hello', ts: Date.now() - 60000 },
          { role: 'assistant', content: 'Hi! This is a mock response. How can I help?', ts: Date.now() - 30000 },
        ]});
      }

      // Workers
      if (url.pathname === '/api/v1/workers' && req.method === 'GET') {
        return send(200, { workers: [
          { pid: 1234, sessionId: 'interactive-1234', kind: 'interactive', cwd: '/home/user', status: 'running' },
        ]});
      }
      if (url.pathname.match(/\/api\/v1\/workers\/\d+/) && req.method === 'DELETE') return send(200, {});
      if (url.pathname.match(/\/api\/v1\/workers\/\w+\/logs/)) return send(200, { logs: '[INFO] Mock log line 1\n[INFO] Mock log line 2' });

      // Daemon
      if (url.pathname === '/api/v1/daemon/status') return send(200, { status: 'running', pid: 5678, endpoint: 'http://127.0.0.1:7890', rssMib: 128, startedAt: Date.now() - 3600000 });

      // Metrics
      if (url.pathname === '/api/v1/metrics') return send(200, { cpuUsedPct: 12, memUsedMib: 512, memTotalMib: 16384, diskUsed: 45, diskTotal: 100 });

      // Plugins
      if (url.pathname === '/api/v1/plugins' && req.method === 'GET') return send(200, { plugins: [
        { name: 'github-copilot', version: '1.0.0', description: 'GitHub Copilot' },
        { name: 'code-review', version: '2.1.0', description: 'Automated code review' },
      ]});
      if (url.pathname === '/api/v1/plugins' && req.method === 'POST') return send(200, {});

      // Tasks
      if (url.pathname === '/api/v1/scheduled-tasks') {
        if (req.method === 'GET') return send(200, { tasks: [{ id: 'task_001', name: 'Nightly Build', cron: '0 2 * * *' }] });
        if (req.method === 'POST') return send(200, { id: 'task_' + Date.now() });
        if (req.method === 'DELETE') return send(200, {});
      }

      // Traces
      if (url.pathname === '/api/v1/traces' && req.method === 'GET') return send(200, { traces: [
        { traceId: 'trace_abc123', serviceName: 'codebuddy-api', durationMs: 45 },
        { traceId: 'trace_def456', serviceName: 'codebuddy-worker', durationMs: 120 },
      ]});
      if (url.pathname.match(/\/api\/v1\/traces\//)) return send(200, { spans: [
        { spanId: 's1', name: 'HTTP POST /runs', durationMs: 45, attributes: { 'http.method': 'POST' } },
      ]});

      // Files
      if (url.pathname === '/api/v1/fs/list' && req.method === 'POST') {
        const body = await new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(JSON.parse(d||'{}'))); });
        const p = body.path || '';
        if (!p || p === '.') return send(200, { files: [
          { name: 'Documents', is_dir: true }, { name: 'Desktop', is_dir: true },
          { name: 'package.json', is_dir: false }, { name: 'src', is_dir: true },
        ]});
        return send(200, { files: [{ name: 'file1.txt', is_dir: false }, { name: 'subdir', is_dir: true }] });
      }

      // Chat SSE
      if (url.pathname === '/api/v1/runs' && req.method === 'POST') {
        const body = await new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(JSON.parse(d||'{}'))); });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);
        setTimeout(() => send('Hi! You said: "' + (body.text || '') + '"'), 100);
        setTimeout(() => send(' I can help with that.'), 500);
        setTimeout(() => { send('.'); res.write('data: [DONE]\n\n'); res.end(); }, 1200);
        return;
      }

      // PTY
      if (url.pathname === '/api/v1/pty' && req.method === 'POST') {
        return send(200, { id: 'pty_' + Date.now(), cols: 120, rows: 30 });
      }
      if (url.pathname.match(/\/api\/v1\/pty\/[^/]+$/) && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: Mock PTY\n');
        res.write('data: $ \n\n');
        const iv = setInterval(() => res.write('data: $ \n\n'), 5000);
        req.on('close', () => clearInterval(iv));
        return;
      }
      if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/output')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: $ \n\n');
        setTimeout(() => res.end(), 10000);
        return;
      }
      if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/input/send')) return send(200, {});

      send(404, { error: 'Not found', path: url.pathname });
    } catch (e) {
      send(500, { error: e.message });
    }
  });

  server.listen(PORT, () => console.log('[mock-api] Running on port ' + PORT));
  return server;
}

// ═══════════════════════════════════════════
// Try to find codebuddy, fall back to mock
// ═══════════════════════════════════════════
const { existsSync } = require('fs');

function findCodeBuddy() {
  const candidates = ['codebuddy', 'codebuddy.cmd'];
  for (const cmd of candidates) {
    if (existsSync(cmd)) return cmd;
  }
  return null;
}

let mockServer = null;

function startBackend() {
  const execPath = findCodeBuddy();
  if (execPath) {
    const { spawn } = require('child_process');
    const proc = spawn(execPath, ['--serve', '--port', '7890'], { stdio: 'pipe' });
    proc.stdout.on('data', d => console.log('[cb]', d.toString().trim()));
    proc.stderr.on('data', d => console.error('[cb:err]', d.toString().trim()));
    console.log('[backend] Started codebuddy from', execPath);
    return proc;
  } else {
    // Start mock server
    mockServer = startMockServer();
    console.log('[backend] CodeBuddy not found, started mock API');
    return null;
  }
}

// ═══════════════════════════════════════════
// Electron Window
// ═══════════════════════════════════════════
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    frame: false,
    backgroundColor: '#121214',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.webContents.on('did-finish-load', async () => {
    console.log('[electron] Page loaded');
    await new Promise(r => setTimeout(r, 3000));
    try {
      const text = await win.webContents.executeJavaScript('document.body.innerText');
      console.log('[electron] PAGE TEXT:\n' + text);
    } catch (e) {
      console.log('[electron] JS Error:', e.message);
    }
  });

  win.loadURL('http://localhost:8080');
}

// ═══════════════════════════════════════════
// App lifecycle
// ═══════════════════════════════════════════
let backendProcess = null;

app.whenReady().then(() => {
  backendProcess = startBackend();
  createWindow();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('will-quit', () => {
  if (backendProcess) backendProcess.kill();
  if (mockServer) mockServer.close();
});

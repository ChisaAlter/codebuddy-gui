const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 7890;

// ═══ Mock API Server ═══
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const send = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    // Health
    if (url.pathname === '/api/v1/health') {
      return send(200, { status: 'ok', uptime: 60 });
    }

    // Sessions
    if (url.pathname === '/api/v1/sessions' && req.method === 'GET') {
      return send(200, {
        sessions: [
          { id: 'sess_001', name: 'New Chat', lastActiveAt: 'Just now' },
          { id: 'sess_002', name: 'Code Review', lastActiveAt: '2 hours ago' },
        ]
      });
    }

    // Session messages
    if (url.pathname.match(/\/api\/v1\/sessions\/[^/]+\/messages/)) {
      const sid = url.pathname.split('/')[4];
      return send(200, {
        messages: [
          { role: 'user', content: 'Hello', ts: Date.now() - 60000 },
          { role: 'assistant', content: 'Hi! How can I help you today?', ts: Date.now() - 30000 },
        ]
      });
    }

    // Workers
    if (url.pathname === '/api/v1/workers' && req.method === 'GET') {
      const kind = url.searchParams.get('kind');
      const all = [
        { pid: 1234, sessionId: 'interactive-1234', kind: 'interactive', cwd: '/home/user', status: 'running' },
        { pid: 'daemon', sessionId: 'daemon', kind: 'daemon', cwd: '/home/user', status: 'running', url: `http://localhost:${PORT}` },
      ];
      return send(200, { workers: kind ? all.filter(w => w.kind === kind) : all });
    }

    if (url.pathname.match(/\/api\/v1\/workers\/\d+/) && req.method === 'DELETE') {
      return send(200, { ok: true });
    }

    if (url.pathname.match(/\/api\/v1\/workers\/\w+\/logs/)) {
      const type = url.searchParams.get('type') || 'telemetry';
      const tail = url.searchParams.get('tail') || '50';
      return send(200, { logs: `[INFO] Mock log entry for ${type}\n[INFO] Another log line\n[DEBUG] Debug message` });
    }

    // Daemon
    if (url.pathname === '/api/v1/daemon/status') {
      return send(200, { status: 'running', pid: 'daemon', endpoint: `http://localhost:${PORT}`, rssMib: 128, startedAt: Date.now() - 3600000 });
    }

    if (url.pathname.startsWith('/api/v1/daemon/') && req.method === 'POST') {
      return send(200, { ok: true });
    }

    // Metrics
    if (url.pathname === '/api/v1/metrics') {
      return send(200, { cpuUsedPct: 15, memUsedMib: 512, memTotalMib: 16384, diskUsed: 45, diskTotal: 100, loadAverage: [0.5, 0.3, 0.2] });
    }

    // Plugins
    if (url.pathname === '/api/v1/plugins') {
      if (req.method === 'GET') {
        return send(200, { plugins: [
          { name: 'github-copilot', version: '1.0.0', description: 'GitHub Copilot integration' },
          { name: 'code-review', version: '2.1.0', description: 'Automated code review' }
        ]});
      }
      if (req.method === 'POST') {
        return send(200, { ok: true });
      }
    }

    // Tasks
    if (url.pathname === '/api/v1/scheduled-tasks') {
      if (req.method === 'GET') {
        return send(200, { tasks: [{ id: 'task_001', name: 'Check Build', cron: '*/5 * * * *', nextRun: '2 min' }] });
      }
      if (req.method === 'POST') {
        const body = await new Promise(resolve => {
          let data = '';
          req.on('data', c => data += c);
          req.on('end', () => resolve(data));
        });
        return send(200, { id: 'task_' + Date.now() });
      }
      if (req.method === 'DELETE') {
        return send(200, { ok: true });
      }
    }

    // Traces
    if (url.pathname === '/api/v1/traces') {
      return send(200, { traces: [
        { traceId: 'trace_abc123', serviceName: 'codebuddy-api', durationMs: 45 },
        { traceId: 'trace_def456', serviceName: 'codebuddy-worker', durationMs: 120 },
      ]});
    }

    if (url.pathname.match(/\/api\/v1\/traces\//)) {
      const traceId = url.pathname.split('/').pop();
      return send(200, { traceId, spans: [
        { spanId: 'span_1', name: 'HTTP POST /api/v1/runs', durationMs: 45, attributes: { 'http.method': 'POST' } },
        { spanId: 'span_2', name: 'codebuddy.process', durationMs: 30 },
      ]});
    }

    // Files
    if (url.pathname === '/api/v1/fs/list' && req.method === 'POST') {
      const body = await new Promise(resolve => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(JSON.parse(data || '{}')));
      });
      const p = body.path || '';
      if (!p || p === '.') {
        return send(200, { files: [
          { name: 'Documents', is_dir: true }, { name: 'Desktop', is_dir: true },
          { name: 'package.json', is_dir: false }, { name: 'src', is_dir: true },
          { name: 'node_modules', is_dir: true }, { name: 'README.md', is_dir: false },
        ]});
      }
      return send(200, { files: [
        { name: 'index.js', is_dir: false }, { name: 'utils.js', is_dir: false },
        { name: 'components', is_dir: true },
      ]});
    }

    // Chat SSE
    if (url.pathname === '/api/v1/runs' && req.method === 'POST') {
      const body = await new Promise(resolve => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(JSON.parse(data || '{}')));
      });

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.setHeader('Access-Control-Allow-Origin', '*');

      const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);

      setTimeout(() => send(`I received your message: "${body.text || ''}"`), 100);
      setTimeout(() => send(' I can help you write code, debug issues, and more.'), 400);
      setTimeout(() => {
        send('. [DONE]');
        res.write('data: [DONE]\n\n');
        res.end();
      }, 1000);
      return;
    }

    // PTY
    if (url.pathname === '/api/v1/pty' && req.method === 'POST') {
      const id = 'pty_' + Date.now();
      return send(200, { id, cols: 120, rows: 30 });
    }

    if (url.pathname.match(/\/api\/v1\/pty\/[^/]+$/) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('data: Welcome to PTY\n');
      res.write('data: $ \n\n');

      const interval = setInterval(() => {
        res.write('data: $ \n\n');
      }, 5000);

      req.on('close', () => clearInterval(interval));
      return;
    }

    if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/output')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: PTY ready\r\n$ \n\n');
      setTimeout(() => {
        res.write('data: Mock PTY output\r\n$ \n\n');
      }, 500);
      setTimeout(() => res.end(), 10000);
      return;
    }

    if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/input/send')) {
      const body = await new Promise(resolve => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(data));
      });
      return send(200, { ok: true });
    }

    send(404, { error: 'Not found', path: url.pathname });
  } catch (e) {
    send(500, { error: e.message });
  }
});

// ═══ Electron Window ═══
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
      console.log('[electron] Error:', e.message);
    }
  });

  win.loadURL('http://localhost:8080');
}

// ═══ Start ═══
server.listen(PORT, () => {
  console.log(`[mock-api] Running on http://localhost:${PORT}`);
  console.log('[electron] Starting Electron...');

  // Detach from terminal so Electron keeps running after bash exits
  const detached = spawn('npx', ['electron', '.', '--no-sandbox'], {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
  });
  detached.unref();
  console.log('[electron] Electron launched (detached)');
  console.log('[mock-api] Use curl or browser to test. Press Ctrl+C to quit.');

  // Keep server alive
  process.on('SIGTERM', () => {
    server.close();
    process.exit(0);
  });
});

const { spawn } = require('child_process');

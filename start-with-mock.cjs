const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 7890;
const HEADERS = { 'X-CodeBuddy-Request': '1' };

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, frame: false,
    backgroundColor: '#121214',
    webPreferences: { 
      preload: path.join(__dirname, 'preload.cjs'), 
      contextIsolation: true, 
      nodeIntegration: false 
    }
  });

  win.webContents.on('did-finish-load', async () => {
    console.log('[electron] === PAGE LOADED ===');
    
    // Wait for React to render and fetch data
    await new Promise(r => setTimeout(r, 3000));
    
    try {
      const text = await win.webContents.executeJavaScript('document.body.innerText');
      console.log('[electron] PAGE TEXT:');
      console.log(text);
      
      const elCount = await win.webContents.executeJavaScript('document.querySelectorAll("*").length');
      console.log('[electron] Elements:', elCount);
    } catch(e) {
      console.log('[electron] JS Error:', e.message);
    }
  });

  win.loadURL('http://localhost:8080');
}

app.whenReady().then(() => {
  // Start codebuddy mock server inline
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost:' + PORT);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }
    
    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    
    // Health
    if (url.pathname === '/api/v1/health') {
      return send(200, { status: 'ok', uptime: 60 });
    }
    
    // Sessions
    if (url.pathname === '/api/v1/sessions' && req.method === 'GET') {
      return send(200, {
        sessions: [
          { id: 's1', name: 'Test Session Alpha', lastActiveAt: 'Just now' },
          { id: 's2', name: 'Code Refactor', lastActiveAt: '3 hours ago' },
        ]
      });
    }
    
    // Workers
    if (url.pathname === '/api/v1/workers' && req.method === 'GET') {
      return send(200, {
        workers: [
          { pid: 1111, sessionId: 'int-1111', kind: 'interactive', cwd: '/home/user' },
        ]
      });
    }
    
    // Daemon
    if (url.pathname === '/api/v1/daemon/status') {
      return send(200, { status: 'running', pid: 2222, endpoint: 'http://127.0.0.1:' + PORT, rssMib: 95, startedAt: Date.now() - 7200000 });
    }
    
    // Metrics
    if (url.pathname === '/api/v1/metrics') {
      return send(200, { cpuUsedPct: 8, memUsedMib: 384, memTotalMib: 8192, diskUsed: 30, diskTotal: 100 });
    }
    
    // Plugins
    if (url.pathname === '/api/v1/plugins' && req.method === 'GET') {
      return send(200, { plugins: [{ name: 'git-helper', version: '1.2.0', description: 'Git integration' }] });
    }
    
    // Tasks
    if (url.pathname === '/api/v1/scheduled-tasks' && req.method === 'GET') {
      return send(200, { tasks: [{ id: 't1', name: 'Nightly Build', cron: '0 2 * * *' }] });
    }
    
    // Traces
    if (url.pathname === '/api/v1/traces') {
      return send(200, { traces: [{ traceId: 'tr-abc123', serviceName: 'codebuddy', durationMs: 12 }] });
    }
    
    // Files
    if (url.pathname === '/api/v1/fs/list' && req.method === 'POST') {
      return send(200, { files: [
        { name: 'src', is_dir: true }, { name: 'docs', is_dir: true },
        { name: 'readme.md', is_dir: false }
      ]});
    }
    
    // Chat (SSE mock)
    if (url.pathname === '/api/v1/runs' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write('data: {"text":"Hi! You said: "}\n\n');
      setTimeout(function() { res.write('data: {"text":"something. I can help with that."}\n\n'); }, 300);
      setTimeout(function() { res.write('data: [DONE]\n\n'); res.end(); }, 800);
      return;
    }
    
    // PTY
    if (url.pathname === '/api/v1/pty' && req.method === 'POST') {
      return send(200, { id: 'pty-' + Date.now(), cols: 120, rows: 30 });
    }
    if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/output')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: PTY ready\r\n$ \n\n');
      setTimeout(function() { res.end(); }, 3000);
      return;
    }
    if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/input/send')) {
      return send(200, {});
    }
    
    send(404, { error: 'not found', path: url.pathname });
  });
  
  server.listen(PORT, function() {
    console.log('[mock-api] Running on http://127.0.0.1:' + PORT);
    createWindow();
  });
});

app.on('window-all-closed', function(e) { e.preventDefault(); });

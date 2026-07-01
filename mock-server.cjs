const http = require('http');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:7890`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-CodeBuddy-Request, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', '*');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const sendJSON = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    if (url.pathname === '/api/v1/health' && req.method === 'GET') {
      return sendJSON(200, { status: 'ok', uptime: 60 });
    }

    if (url.pathname === '/api/v1/sessions' && req.method === 'GET') {
      return sendJSON(200, {
        sessions: [
          { id: 'sess_001', name: 'New Chat', lastActiveAt: 'Just now' },
          { id: 'sess_002', name: 'Code Review', lastActiveAt: '2 hours ago' },
        ]
      });
    }

    if (url.pathname === '/api/v1/workers' && req.method === 'GET') {
      return sendJSON(200, {
        workers: [
          { pid: 1234, sessionId: 'interactive-1234', kind: 'interactive', cwd: '/c/Users/48818' },
          { pid: 5678, sessionId: 'daemon', kind: 'daemon', cwd: '/c/Users/48818' },
        ]
      });
    }

    if (url.pathname === '/api/v1/daemon/status' && req.method === 'GET') {
      return sendJSON(200, { status: 'running', pid: 5678, endpoint: 'http://127.0.0.1:7890', rssMib: 128, startedAt: Date.now() - 3600000 });
    }

    if (url.pathname === '/api/v1/metrics' && req.method === 'GET') {
      return sendJSON(200, { cpuUsedPct: 12, memUsedMib: 512, memTotalMib: 16384, diskUsed: 45, diskTotal: 100 });
    }

    if (url.pathname === '/api/v1/runs' && req.method === 'POST') {
      const body = await new Promise(resolve => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(data));
      });
      
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      
      const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);
      setTimeout(() => send('Hello! This is a mock response.'), 100);
      setTimeout(() => send(' I can help you with code.'), 500);
      setTimeout(() => {
        res.write('data: [DONE]\n\n');
        res.end();
      }, 1500);
      return;
    }

    if (url.pathname === '/api/v1/pty' && req.method === 'POST') {
      const id = 'pty_' + Date.now();
      return sendJSON(200, { id, cols: 120, rows: 30 });
    }

    if (url.pathname.match(/\/api\/v1\/pty\/[^/]+$/) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: Welcome to mock PTY\n\n');
      setTimeout(() => {
        res.write('data: $ \n\n');
        res.end();
      }, 500);
      return;
    }

    if (url.pathname.startsWith('/api/v1/pty/') && url.pathname.endsWith('/input/send')) {
      return sendJSON(200, {});
    }

    if (url.pathname === '/api/v1/scheduled-tasks') {
      if (req.method === 'GET') {
        return sendJSON(200, { tasks: [{ id: 'task_001', name: 'Check Build', cron: '*/5 * * * *' }] });
      }
      if (req.method === 'POST') {
        return sendJSON(200, { id: 'task_' + Date.now() });
      }
      if (req.method === 'DELETE') {
        return sendJSON(200, {});
      }
    }

    if (url.pathname === '/api/v1/plugins') {
      if (req.method === 'GET') {
        return sendJSON(200, { plugins: [{ name: 'github-copilot', version: '1.0.0', description: 'GitHub integration' }, { name: 'code-review', version: '2.1.0', description: 'Auto code review' }] });
      }
      if (req.method === 'POST') {
        return sendJSON(200, {});
      }
    }

    if (url.pathname === '/api/v1/fs/list' && req.method === 'POST') {
      const body = await new Promise(resolve => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(JSON.parse(data || '{}')));
      });
      const p = body.path || '';
      if (!p || p === '.' || p === '/') {
        return sendJSON(200, { files: [
          { name: 'Documents', is_dir: true }, { name: 'Desktop', is_dir: true },
          { name: 'package.json', is_dir: false }, { name: 'src', is_dir: true },
        ]});
      }
      return sendJSON(200, { files: [{ name: 'file1.txt', is_dir: false }, { name: 'file2.js', is_dir: false }] });
    }

    if (url.pathname === '/api/v1/traces' && req.method === 'GET') {
      return sendJSON(200, { traces: [{ traceId: 'trace_' + Date.now(), serviceName: 'codebuddy-api', durationMs: 45 }] });
    }

    sendJSON(404, { error: 'Not found', path: url.pathname });

  } catch(e) {
    sendJSON(500, { error: e.message });
  }
});

server.listen(7890, '127.0.0.1', () => {
  console.log('[mock-api] Running on http://127.0.0.1:7890');
});

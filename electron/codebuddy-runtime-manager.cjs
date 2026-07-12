const { spawn, execFileSync } = require('child_process');

function publicRuntime(entry) {
  if (!entry) return null;
  return {
    projectId: entry.projectId,
    cwd: entry.cwd,
    status: entry.status,
    port: entry.port || null,
    pid: entry.proc?.pid || null,
    error: entry.error || null,
    startedAt: entry.startedAt || null,
  };
}

function runtimeConnection(entry) {
  return { ...publicRuntime(entry), password: entry.password || null };
}

function createCodeBuddyRuntimeManager({ net, logger = () => {}, onStatus = () => {} }) {
  const runtimes = new Map();

  function emit(entry) {
    const value = publicRuntime(entry);
    onStatus(value);
    return value;
  }

  async function authenticate(entry) {
    const url = `http://127.0.0.1:${entry.port}/?password=${encodeURIComponent(entry.password)}`;
    const response = await net.fetch(url, { headers: { 'X-CodeBuddy-Request': '1' } });
    if (!response.ok) throw new Error(`CodeBuddy authentication failed: ${response.status}`);
  }

  function stopProcess(entry) {
    if (!entry?.proc || entry.proc.killed) return;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(entry.proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        entry.proc.kill('SIGTERM');
      }
    } catch (_) {
      try { entry.proc.kill('SIGKILL'); } catch (_) {}
    }
  }

  function start(entry) {
    const runId = (entry.runId || 0) + 1;
    entry.runId = runId;
    entry.status = 'starting';
    entry.error = null;
    emit(entry);
    logger(`Starting CodeBuddy runtime project=${entry.projectId} cwd=${entry.cwd}`);

    const promise = new Promise((resolve, reject) => {
      const proc = spawn('codebuddy', ['--serve'], {
        cwd: entry.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
      entry.proc = proc;
      entry.startedAt = new Date().toISOString();
      let stdoutBuffer = '';
      let settled = false;

      entry.cancelStart = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('CodeBuddy start cancelled'));
      };

      const finish = async (error) => {
        if (settled || entry.runId !== runId) return;
        if (error) {
          settled = true;
          clearTimeout(timeoutId);
          entry.status = 'error';
          entry.error = error.message;
          emit(entry);
          reject(error);
          return;
        }
        if (!entry.port || !entry.password) return;
        settled = true;
        clearTimeout(timeoutId);
        try {
          await authenticate(entry);
          entry.status = 'running';
          entry.error = null;
          logger(`CodeBuddy runtime ready project=${entry.projectId} port=${entry.port}`);
          emit(entry);
          resolve(runtimeConnection(entry));
        } catch (authError) {
          entry.status = 'error';
          entry.error = authError.message;
          stopProcess(entry);
          emit(entry);
          reject(authError);
        }
      };

      const timeoutId = setTimeout(() => {
        finish(new Error('CodeBuddy start timeout: port or password not announced'));
        stopProcess(entry);
      }, 30000);

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutBuffer = `${stdoutBuffer}${text}`.slice(-12000);
        if (!entry.port) {
          const match = stdoutBuffer.match(/http:\/\/127\.0\.0\.1:(\d+)/);
          if (match) entry.port = Number(match[1]);
        }
        if (!entry.password) {
          const passwordMatch = stdoutBuffer.match(/Password\s+([\w-]+)/)
            || stdoutBuffer.match(/\?password=([\w-]+)/);
          if (passwordMatch) entry.password = passwordMatch[1];
        }
        finish();
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) logger(`CodeBuddy runtime stderr project=${entry.projectId}: ${text}`);
      });

      proc.on('error', (error) => finish(error));
      proc.on('exit', (code, signal) => {
        clearTimeout(timeoutId);
        if (entry.runId !== runId) return;
        entry.proc = null;
        entry.port = null;
        entry.password = null;
        if (!settled) {
          finish(new Error(`CodeBuddy exited before ready (code=${code}, signal=${signal})`));
          return;
        }
        if (entry.status !== 'stopping' && entry.status !== 'error') {
          entry.status = code === 0 ? 'stopped' : 'error';
          entry.error = code === 0 ? null : `CodeBuddy exited (code=${code}, signal=${signal})`;
          emit(entry);
        }
      });
    });
    const trackedPromise = promise.finally(() => {
      if (entry.startPromise === trackedPromise) entry.startPromise = null;
      if (entry.runId === runId) entry.cancelStart = null;
    });
    entry.startPromise = trackedPromise;

    return trackedPromise;
  }

  async function ensure(projectId, cwd) {
    if (!projectId) throw new Error('projectId is required');
    if (!cwd) throw new Error('project cwd is required');
    let entry = runtimes.get(projectId);
    if (entry?.status === 'running' && entry.proc && !entry.proc.killed) return runtimeConnection(entry);
    if (entry?.startPromise) return entry.startPromise;
    if (entry && entry.cwd !== cwd) {
      await stop(projectId);
      entry = null;
    }
    if (!entry) {
      entry = {
        projectId,
        cwd,
        status: 'idle',
        port: null,
        password: null,
        proc: null,
        startPromise: null,
        cancelStart: null,
        runId: 0,
        error: null,
        startedAt: null,
      };
      runtimes.set(projectId, entry);
    }
    return start(entry);
  }

  async function stop(projectId) {
    const entry = runtimes.get(projectId);
    if (!entry) return null;
    entry.status = 'stopping';
    emit(entry);
    entry.cancelStart?.();
    entry.runId = (entry.runId || 0) + 1;
    stopProcess(entry);
    entry.proc = null;
    entry.port = null;
    entry.password = null;
    entry.startPromise = null;
    entry.cancelStart = null;
    entry.status = 'stopped';
    entry.error = null;
    return emit(entry);
  }

  async function restart(projectId, cwd) {
    await stop(projectId);
    runtimes.delete(projectId);
    return ensure(projectId, cwd);
  }

  function list() {
    return Array.from(runtimes.values(), publicRuntime);
  }

  async function stopAll() {
    await Promise.allSettled(Array.from(runtimes.keys(), (projectId) => stop(projectId)));
    runtimes.clear();
  }

  return { ensure, list, restart, stop, stopAll };
}

module.exports = { createCodeBuddyRuntimeManager };

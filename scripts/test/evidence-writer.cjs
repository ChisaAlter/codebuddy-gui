'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const RAW_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const SENSITIVE_KEY_PATTERN =
  /(?:^|[-_])(password|passwd|passphrase|serve[-_]?password|token|access[-_]?token|refresh[-_]?token|authorization|cookie|set[-_]?cookie|secret|api[-_]?key)(?:$|[-_])/i;

function stripControlSequences(value) {
  return String(value ?? '')
    .replace(/(?:\u001b\]|\u009d)[\s\S]*?(?:\u0007|\u001b\\|\u009c)/gi, '')
    .replace(/(?:\u001bP|\u0090)[\s\S]*?(?:\u001b\\|\u009c)/g, '')
    .replace(/(?:\u001b\^|\u009e)[\s\S]*?(?:\u001b\\|\u009c)/g, '')
    .replace(/(?:\u001b_|\u009f)[\s\S]*?(?:\u001b\\|\u009c)/g, '')
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-_]/g, '')
    .replace(RAW_CONTROL_PATTERN, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedRedactionEntries(redactionMap) {
  const entries = [];
  if (Array.isArray(redactionMap)) {
    for (const entry of redactionMap) {
      if (Array.isArray(entry)) entries.push({ from: entry[0], to: entry[1] });
      else if (entry && typeof entry === 'object') entries.push(entry);
    }
  } else if (redactionMap && typeof redactionMap === 'object') {
    for (const [from, to] of Object.entries(redactionMap)) entries.push({ from, to });
  }
  for (const home of [os.homedir(), process.env.USERPROFILE, process.env.HOME]) {
    if (home) entries.push({ from: home, to: '[user-home]' });
  }
  const unique = new Map();
  for (const entry of entries) {
    const from = String(entry?.from || '').trim();
    if (!from) continue;
    unique.set(from, String(entry?.to || '[redacted-path]'));
  }
  return [...unique.entries()]
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => b.from.length - a.from.length);
}

function redactPaths(value, redactionMap) {
  let text = String(value ?? '');
  for (const { from, to } of normalizedRedactionEntries(redactionMap)) {
    const variants = new Set([from, from.replace(/\\/g, '/'), from.replace(/\//g, '\\')]);
    for (const variant of variants) {
      if (!variant) continue;
      text = text.replace(new RegExp(escapeRegExp(variant), process.platform === 'win32' ? 'gi' : 'g'), to);
    }
  }
  return text;
}

function sanitizeText(value, options = {}) {
  return redactPaths(
    stripControlSequences(value)
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/((?:Cookie|Set-Cookie)\s*:\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/([?&](?:password|token|access_token|api_key|secret)=)[^\s&#]+/gi, '$1[redacted]')
    .replace(/(["'](?:password|passwd|passphrase|serve[-_]?password|token|access[-_]?token|refresh[-_]?token|authorization|cookie|secret|api[-_]?key)["']\s*:\s*["'])[^"']*(["'])/gi, '$1[redacted]$2')
    .replace(/((?:password|passwd|passphrase|serve[-_]?password|token|access[-_]?token|refresh[-_]?token|authorization|cookie|secret|api[-_]?key)\s*=\s*)[^\s,;&}]+/gi, '$1[redacted]')
    .replace(/((?:Password|password)\s*:\s*)[^\s,;}]+/g, '$1[redacted]')
    .replace(/((?:Password|password)[ \t]{2,})[^\s,;}]+/g, '$1[redacted]')
    .replace(/(["']password["']\s*:\s*["'])[^"']+(["'])/gi, '$1[redacted]$2'),
    options.redactionMap,
  );
}

function sanitizeValue(value, options = {}) {
  if (typeof value === 'string') return sanitizeText(value, options);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, options));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeValue(entry, options),
      ]),
    );
  }
  return value;
}

function safeSegment(value, fallback) {
  const cleaned = String(value || fallback)
    .replace(/[:.]/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function createUniqueRunDir(rootDir, baseName) {
  fs.mkdirSync(rootDir, { recursive: true });
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${String(attempt).padStart(2, '0')}`;
    const candidate = path.join(rootDir, `${baseName}${suffix}`);
    try {
      fs.mkdirSync(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`Could not allocate a unique evidence directory below ${rootDir}`);
}

function createTaskRunLayout(options = {}) {
  const evidenceRoot = path.resolve(options.evidenceRoot || path.join(process.cwd(), '.omo', 'evidence', 'runs'));
  const screenshotRoot = path.resolve(
    options.screenshotRoot || path.join(process.cwd(), '.omo', 'evidence', 'screenshots'),
  );
  const taskId = safeSegment(options.taskId, 'task');
  const runLabel = safeSegment(options.runLabel, 'run');
  const requestedId = safeSegment(options.requestedId || new Date().toISOString(), 'timestamp');
  const baseName = `${taskId}-${runLabel}-${requestedId}`;
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.mkdirSync(screenshotRoot, { recursive: true });
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${String(attempt).padStart(2, '0')}`;
    const runName = `${baseName}${suffix}`;
    const runDir = path.join(evidenceRoot, runName);
    const screenshotDir = path.join(screenshotRoot, runName);
    try {
      fs.mkdirSync(runDir);
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      fs.mkdirSync(screenshotDir);
      return { runName, requestedId, runDir, screenshotDir, evidenceRoot, screenshotRoot };
    } catch (error) {
      fs.rmdirSync(runDir);
      if (error.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`Could not allocate a unique task run layout below ${evidenceRoot}`);
}

function markdownForEvidence(data) {
  const lines = [
    `# ${data.taskId || 'task'} ${data.runLabel || 'run'} evidence`,
    '',
    `Status: ${data.status || 'UNKNOWN'}`,
    '',
    ...(data.releaseDisposition ? [`Release disposition: ${data.releaseDisposition}`, ''] : []),
    `Captured: ${data.capturedAt}`,
    '',
  ];

  if (data.baselineSources?.length) {
    lines.push('## Immutable baseline sources', '');
    for (const source of data.baselineSources) {
      lines.push(
        `- \`${source.path}\` — pinned SHA-256 \`${source.sha256}\` — ` +
          `present: \`${Boolean(source.present)}\` — verification: \`${source.verification || 'not-verified'}\``,
      );
    }
    lines.push('');
  }

  if (data.baselineInventory?.length) {
    lines.push('## Complete baseline blocker inventory', '');
    for (const item of data.baselineInventory) {
      lines.push(`### ${item.id} — ${item.title}`, '');
      lines.push(`- Baseline classification: ${item.classification}`);
      lines.push(`- Current disposition: ${item.disposition}`);
      lines.push(`- Owning task: ${item.owningTask}`);
      for (const source of item.sources || []) {
        lines.push(`- Source: \`${source.path}\` — ${source.section}`);
      }
      lines.push('');
    }
  }

  if (data.context && Object.keys(data.context).length) {
    lines.push('## Runtime and capability context', '');
    for (const [key, value] of Object.entries(data.context)) {
      lines.push(`- ${key}: \`${String(value)}\``);
    }
    lines.push('');
  }

  if (data.commands?.length) {
    lines.push('## Commands', '');
    for (const command of data.commands) {
      lines.push(`- \`${command.command}\` → exit \`${command.exitCode}\``);
    }
    lines.push('');
  }

  if (data.assertions?.length) {
    lines.push('## Assertions', '');
    for (const assertion of data.assertions) {
      lines.push(
        `- ${assertion.ok ? 'PASS' : 'FAIL'} — ${assertion.name}${assertion.detail ? `: ${assertion.detail}` : ''}`,
      );
    }
    lines.push('');
  }

  if (data.screenshots?.length) {
    lines.push('## Screenshots', '');
    for (const screenshot of data.screenshots) {
      lines.push(
        `- ${screenshot.name || 'screenshot'}: \`${screenshot.path}\`` +
          `${screenshot.sha256 ? ` — sha256 \`${screenshot.sha256}\`` : ''}` +
          `${screenshot.analysis ? ` — ${screenshot.analysis}` : ''}`,
      );
    }
    lines.push('');
  }

  if (data.logs?.length) {
    lines.push('## Sanitized logs', '', '```text');
    lines.push(...data.logs.map((entry) => String(entry)));
    lines.push('```', '');
  }

  return `${lines.join('\n')}\n`;
}

function listEvidenceFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return [targetPath];
  const files = [];
  const queue = [targetPath];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile() && /\.(?:json|md|log|txt)$/i.test(entry.name)) files.push(fullPath);
    }
  }
  return files;
}

async function sanitizeEvidenceTree(options = {}) {
  const rootDir = path.resolve(options.rootDir || options.path || '');
  const files = listEvidenceFiles(rootDir);
  let filesChanged = 0;
  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    let sanitized;
    if (/\.json$/i.test(filePath)) {
      try {
        sanitized = `${JSON.stringify(sanitizeValue(JSON.parse(original), options), null, 2)}\n`;
      } catch (_) {
        sanitized = sanitizeText(original, options);
      }
    } else {
      sanitized = sanitizeText(original, options);
    }
    if (sanitized !== original) {
      fs.writeFileSync(filePath, sanitized, 'utf8');
      filesChanged += 1;
    }
  }
  return { rootDir, filesSanitized: files.length, filesChanged };
}

const SECRET_SCAN_RULES = Object.freeze([
  { name: 'authorization-bearer', pattern: /Authorization\s*:\s*Bearer\s+[^\s,;]+/gi },
  { name: 'cookie-header', pattern: /(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi },
  {
    name: 'secret-query',
    pattern: /[?&](?:password|token|access_token|api_key|secret)=[^\s&#]+/gi,
  },
  {
    name: 'secret-json',
    pattern:
      /["'](?:password|passwd|passphrase|serve[-_]?password|token|access[-_]?token|refresh[-_]?token|authorization|cookie|secret|api[-_]?key)["']\s*:\s*["'][^"']+["']/gi,
  },
  {
    name: 'secret-assignment',
    pattern:
      /(?:password|passwd|passphrase|serve[-_]?password|token|access[-_]?token|refresh[-_]?token|authorization|cookie|secret|api[-_]?key)\s*=\s*[^\s,;&}]+/gi,
  },
  { name: 'password-line', pattern: /\bPassword(?:\s*:|[ \t]{2,})\s*[^\s,;}]+/g },
]);

function scanEvidenceSecrets(options = {}) {
  const roots = (options.roots || []).map((root) => path.resolve(root));
  const matches = [];
  for (const root of roots) {
    for (const filePath of listEvidenceFiles(root)) {
      const rawText = fs.readFileSync(filePath, 'utf8');
      RAW_CONTROL_PATTERN.lastIndex = 0;
      if (RAW_CONTROL_PATTERN.test(rawText)) {
        matches.push({ path: filePath, rule: 'control-character' });
      }
      const text = stripControlSequences(rawText);
      for (const rule of SECRET_SCAN_RULES) {
        rule.pattern.lastIndex = 0;
        let match;
        while ((match = rule.pattern.exec(text))) {
          if (!match[0].toLowerCase().includes('[redacted]')) {
            matches.push({ path: filePath, rule: rule.name });
            break;
          }
        }
      }
    }
  }
  const paths = [...new Set(matches.map((entry) => entry.path))];
  return { count: matches.length, paths, matches };
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeContactSheet(options = {}) {
  const screenshots = (options.screenshots || []).filter((item) => item?.path && fs.existsSync(item.path));
  if (!screenshots.length) throw new Error('writeContactSheet requires at least one existing screenshot');
  const outputPath = path.resolve(
    options.outputPath || path.join(path.dirname(screenshots[0].path), 'contact-sheet.svg'),
  );
  const columns = Math.max(1, Number(options.columns) || 3);
  const cellWidth = Number(options.cellWidth) || 480;
  const imageHeight = Number(options.imageHeight) || 300;
  const labelHeight = 32;
  const cellHeight = imageHeight + labelHeight;
  const rows = Math.ceil(screenshots.length / columns);
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const cells = screenshots
    .map((item, index) => {
      const x = (index % columns) * cellWidth;
      const y = Math.floor(index / columns) * cellHeight;
      const data = fs.readFileSync(item.path).toString('base64');
      return [
        `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="#111827" stroke="#334155"/>`,
        `<text x="${x + 12}" y="${y + 21}" fill="#e2e8f0" font-family="Segoe UI, sans-serif" font-size="14">${xmlEscape(item.name || path.basename(item.path))}</text>`,
        `<image x="${x + 4}" y="${y + labelHeight}" width="${cellWidth - 8}" height="${imageHeight - 4}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/>`,
      ].join('');
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#020617"/>${cells}</svg>\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, 'utf8');
  return { path: outputPath, screenshots: screenshots.length, width, height };
}

async function writeTaskEvidence(options = {}) {
  const requestedRunDir = options.runDir ? path.resolve(options.runDir) : null;
  const rootDir = path.resolve(
    options.rootDir || (requestedRunDir ? path.dirname(requestedRunDir) : path.join(process.cwd(), '.omo', 'evidence')),
  );
  const pathRoot = path.resolve(options.pathRoot || process.cwd());
  const taskId = safeSegment(options.taskId, 'task');
  const runLabel = safeSegment(options.runLabel, 'run');
  const capturedAt = options.capturedAt || new Date().toISOString();
  const timestamp = safeSegment(options.timestamp || capturedAt, 'timestamp');
  const runDir = requestedRunDir || createUniqueRunDir(rootDir, `${taskId}-${runLabel}-${timestamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  const screenshots = (options.screenshots || []).map((screenshot) => {
    const absolutePath = path.resolve(screenshot.path);
    const sha256 =
      screenshot.sha256 ||
      (fs.existsSync(absolutePath)
        ? crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')
        : undefined);
    return {
      ...screenshot,
      path: path.relative(pathRoot, absolutePath).replace(/\\/g, '/'),
      sha256,
    };
  });
  const data = sanitizeValue(
    {
      ...options,
      rootDir: undefined,
      pathRoot: undefined,
      redactionMap: undefined,
      taskId,
      runLabel,
      capturedAt,
      runDir: path.relative(pathRoot, runDir).replace(/\\/g, '/'),
      screenshots,
    },
    { redactionMap: options.redactionMap },
  );
  const jsonPath = path.join(runDir, 'evidence.json');
  const reportPath = path.join(runDir, 'report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, markdownForEvidence(data), 'utf8');
  return { runDir, jsonPath, reportPath, data };
}

module.exports = {
  safeSegment,
  createTaskRunLayout,
  stripControlSequences,
  sanitizeText,
  sanitizeValue,
  sanitizeEvidenceTree,
  scanEvidenceSecrets,
  writeContactSheet,
  writeTaskEvidence,
};

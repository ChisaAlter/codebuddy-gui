const fs = require('fs');
const os = require('os');
const path = require('path');
const { parse: parseJsonc } = require('jsonc-parser');

const ENV_REFERENCE_PATTERN = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

function resolveModelConfigPath({ homeDir = os.homedir(), env = process.env } = {}) {
  const configRoot = String(env.CODEBUDDY_CONFIG_DIR || '').trim() || path.join(homeDir, '.codebuddy');
  return path.join(configRoot, 'models.json');
}

function parseModelConfig(text, filePath) {
  const errors = [];
  const value = parseJsonc(String(text || '').replace(/^\uFEFF/, ''), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length) {
    const offset = errors[0]?.offset;
    throw new Error(`模型配置 JSON 格式无效${Number.isFinite(offset) ? `（位置 ${offset}）` : ''}: ${filePath}`);
  }
  if (Array.isArray(value)) {
    return { shape: 'array', raw: value, models: value, availableModels: undefined };
  }
  if (!value || typeof value !== 'object') throw new Error(`模型配置必须是 JSON 对象: ${filePath}`);
  if (value.models !== undefined && !Array.isArray(value.models)) throw new Error(`models 字段必须是数组: ${filePath}`);
  if (value.availableModels !== undefined && !Array.isArray(value.availableModels)) {
    throw new Error(`availableModels 字段必须是数组: ${filePath}`);
  }
  return {
    shape: 'object',
    raw: value,
    models: Array.isArray(value.models) ? value.models : [],
    availableModels: Array.isArray(value.availableModels) ? value.availableModels : undefined,
  };
}

function readInternalModelConfig(filePath = resolveModelConfigPath()) {
  if (!fs.existsSync(filePath)) {
    return { filePath, exists: false, shape: 'object', raw: { models: [] }, models: [], availableModels: undefined };
  }
  const parsed = parseModelConfig(fs.readFileSync(filePath, 'utf8'), filePath);
  return { filePath, exists: true, ...parsed };
}

function finiteOptionalNumber(value, label, { integer = true, min, max } = {}) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)))
    throw new Error(`${label}必须是${integer ? '整数' : '数字'}`);
  if (min !== undefined && number < min) throw new Error(`${label}不能小于 ${min}`);
  if (max !== undefined && number > max) throw new Error(`${label}不能大于 ${max}`);
  return number;
}

function normalizeEndpoint(value) {
  const endpoint = String(value || '').trim();
  if (!endpoint) throw new Error('接口地址不能为空');
  if (ENV_REFERENCE_PATTERN.test(endpoint)) return endpoint;
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch (_) {
    throw new Error('接口地址格式无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('接口地址必须是有效的 HTTP 或 HTTPS 地址');
  }
  return parsed.toString();
}

function normalizeModelPayload(payload = {}) {
  const id = String(payload.id || '').trim();
  const hasControlCharacter = Array.from(id).some((character) => character.charCodeAt(0) < 32);
  if (!id || id.length > 160 || /\s/.test(id) || hasControlCharacter) {
    throw new Error('模型名称不能为空，且不能包含空格或控制字符');
  }
  const name =
    String(payload.name || id)
      .trim()
      .slice(0, 160) || id;
  const vendor =
    String(payload.vendor || 'Custom')
      .trim()
      .slice(0, 80) || 'Custom';
  const apiKey = String(payload.apiKey || '').trim();
  if (apiKey.length > 4096) throw new Error('API Key 过长');
  return {
    id,
    name,
    vendor,
    url: normalizeEndpoint(payload.url),
    apiKey,
    preserveApiKey: payload.preserveApiKey !== false,
    maxInputTokens: finiteOptionalNumber(payload.maxInputTokens, '最大输入 Token', { min: 1, max: 100000000 }),
    maxOutputTokens: finiteOptionalNumber(payload.maxOutputTokens, '最大输出 Token', { min: 1, max: 100000000 }),
    temperature: finiteOptionalNumber(payload.temperature, 'Temperature', { integer: false, min: 0, max: 2 }),
    supportsToolCall: payload.supportsToolCall !== false,
    supportsImages: Boolean(payload.supportsImages),
    supportsReasoning: Boolean(payload.supportsReasoning),
  };
}

function publicModel(model) {
  const apiKey = typeof model?.apiKey === 'string' ? model.apiKey : '';
  return {
    id: String(model?.id || ''),
    name: String(model?.name || model?.id || ''),
    vendor: String(model?.vendor || 'Custom'),
    url: String(model?.url || ''),
    maxInputTokens: Number.isFinite(model?.maxInputTokens) ? model.maxInputTokens : null,
    maxOutputTokens: Number.isFinite(model?.maxOutputTokens) ? model.maxOutputTokens : null,
    temperature: Number.isFinite(model?.temperature) ? model.temperature : null,
    supportsToolCall: model?.supportsToolCall !== false,
    supportsImages: Boolean(model?.supportsImages),
    supportsReasoning: Boolean(model?.supportsReasoning),
    hasApiKey: Boolean(apiKey),
    apiKeyReference: ENV_REFERENCE_PATTERN.test(apiKey) ? apiKey : '',
  };
}

function displayModelConfigPath(filePath, homeDir = os.homedir()) {
  const relative = path.relative(homeDir, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return `%USERPROFILE%\\${relative.replace(/[\\/]+/g, '\\')}`;
  }
  return filePath;
}

function listModelConfig(options = {}) {
  const filePath = options.filePath || resolveModelConfigPath(options);
  const config = readInternalModelConfig(filePath);
  let updatedAt = null;
  if (config.exists) {
    try {
      updatedAt = fs.statSync(filePath).mtime.toISOString();
    } catch (_) {}
  }
  return {
    filePath,
    displayPath: displayModelConfigPath(filePath, options.homeDir || os.homedir()),
    exists: config.exists,
    updatedAt,
    models: config.models.filter((model) => model && typeof model === 'object').map(publicModel),
  };
}

function serializeModelConfig(config) {
  if (config.shape === 'array') return config.models;
  const next = { ...config.raw, models: config.models };
  if (config.availableModels === undefined) delete next.availableModels;
  else next.availableModels = config.availableModels;
  return next;
}

function writeModelConfig(config) {
  const filePath = config.filePath;
  const directory = path.dirname(filePath);
  const tempFile = `${filePath}.tmp`;
  const backupFile = `${filePath}.bak`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempFile, `${JSON.stringify(serializeModelConfig(config), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    if (fs.existsSync(backupFile)) fs.rmSync(backupFile, { force: true });
    if (fs.existsSync(filePath)) fs.renameSync(filePath, backupFile);
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    try {
      if (!fs.existsSync(filePath) && fs.existsSync(backupFile)) fs.copyFileSync(backupFile, filePath);
    } catch (_) {}
    try {
      fs.rmSync(tempFile, { force: true });
    } catch (_) {}
    throw error;
  }
}

function saveModelConfig(payload = {}, options = {}) {
  const filePath = options.filePath || resolveModelConfigPath(options);
  const config = readInternalModelConfig(filePath);
  const normalized = normalizeModelPayload(payload);
  const originalId = String(payload.originalId || '').trim();
  const originalIndex = originalId ? config.models.findIndex((model) => model?.id === originalId) : -1;
  const targetIndex = config.models.findIndex((model) => model?.id === normalized.id);
  if (targetIndex !== -1 && targetIndex !== originalIndex) throw new Error(`模型 “${normalized.id}” 已存在`);

  const previous = originalIndex >= 0 ? config.models[originalIndex] : null;
  const nextModel = {
    ...(previous && typeof previous === 'object' ? previous : {}),
    id: normalized.id,
    name: normalized.name,
    vendor: normalized.vendor,
    url: normalized.url,
    supportsToolCall: normalized.supportsToolCall,
    supportsImages: normalized.supportsImages,
    supportsReasoning: normalized.supportsReasoning,
  };
  if (normalized.apiKey) nextModel.apiKey = normalized.apiKey;
  else if (!normalized.preserveApiKey) delete nextModel.apiKey;
  if (normalized.maxInputTokens === undefined) delete nextModel.maxInputTokens;
  else nextModel.maxInputTokens = normalized.maxInputTokens;
  if (normalized.maxOutputTokens === undefined) delete nextModel.maxOutputTokens;
  else nextModel.maxOutputTokens = normalized.maxOutputTokens;
  if (normalized.temperature === undefined) delete nextModel.temperature;
  else nextModel.temperature = normalized.temperature;

  if (originalIndex >= 0) config.models.splice(originalIndex, 1, nextModel);
  else config.models.push(nextModel);
  if (Array.isArray(config.availableModels)) {
    config.availableModels = config.availableModels.filter((id) => id !== originalId && id !== normalized.id);
    config.availableModels.push(normalized.id);
  }
  writeModelConfig(config);
  return listModelConfig({ ...options, filePath });
}

function deleteModelConfig(modelId, options = {}) {
  const id = String(modelId || '').trim();
  if (!id) throw new Error('模型 ID 不能为空');
  const filePath = options.filePath || resolveModelConfigPath(options);
  const config = readInternalModelConfig(filePath);
  const nextModels = config.models.filter((model) => model?.id !== id);
  if (nextModels.length === config.models.length) throw new Error(`未找到模型 “${id}”`);
  config.models = nextModels;
  if (Array.isArray(config.availableModels))
    config.availableModels = config.availableModels.filter((value) => value !== id);
  writeModelConfig(config);
  return listModelConfig({ ...options, filePath });
}

function ensureModelConfigFile(options = {}) {
  const filePath = options.filePath || resolveModelConfigPath(options);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{\n  "models": []\n}\n', { encoding: 'utf8', mode: 0o600 });
  }
  return filePath;
}

module.exports = {
  deleteModelConfig,
  displayModelConfigPath,
  ensureModelConfigFile,
  listModelConfig,
  normalizeModelPayload,
  parseModelConfig,
  readInternalModelConfig,
  resolveModelConfigPath,
  saveModelConfig,
};

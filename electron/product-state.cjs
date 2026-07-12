const fs = require('fs');
const path = require('path');

const PRODUCT_STATE_VERSION = 1;

function emptyProductState() {
  return {
    version: PRODUCT_STATE_VERSION,
    projectsById: {},
    projectOrder: [],
    threadsById: {},
    threadOrderByProject: {},
    activeProjectId: null,
    activeThreadId: null,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProductState(value) {
  if (!isPlainObject(value)) return emptyProductState();

  const projectsById = isPlainObject(value.projectsById) ? value.projectsById : {};
  const threadsById = isPlainObject(value.threadsById) ? value.threadsById : {};
  const projectOrder = Array.isArray(value.projectOrder)
    ? value.projectOrder.filter((id) => typeof id === 'string' && projectsById[id])
    : [];
  const threadOrderByProject = {};

  for (const projectId of projectOrder) {
    const requestedOrder = Array.isArray(value.threadOrderByProject?.[projectId])
      ? value.threadOrderByProject[projectId]
      : [];
    threadOrderByProject[projectId] = requestedOrder.filter((threadId) => {
      const thread = threadsById[threadId];
      return typeof threadId === 'string' && thread?.projectId === projectId;
    });
  }

  const activeProjectId = projectOrder.includes(value.activeProjectId)
    ? value.activeProjectId
    : (projectOrder[0] || null);
  const activeThreadId = activeProjectId
    && threadOrderByProject[activeProjectId]?.includes(value.activeThreadId)
    ? value.activeThreadId
    : (threadOrderByProject[activeProjectId]?.[0] || null);

  return {
    version: PRODUCT_STATE_VERSION,
    projectsById,
    projectOrder,
    threadsById,
    threadOrderByProject,
    activeProjectId,
    activeThreadId,
  };
}

function createProductStateStore(userDataPath, logger = () => {}) {
  const stateFile = path.join(userDataPath, 'product-state.json');

  function quarantineInvalid(filePath, label = '') {
    if (!fs.existsSync(filePath)) return null;
    const suffix = label ? `-${label}` : '';
    const invalidFile = path.join(
      userDataPath,
      `product-state.invalid-${Date.now()}${suffix}.json`,
    );
    fs.renameSync(filePath, invalidFile);
    logger(`Invalid product state moved to ${invalidFile}`);
    return invalidFile;
  }

  function load() {
    const backupFile = `${stateFile}.bak`;
    if (!fs.existsSync(stateFile) && fs.existsSync(backupFile)) {
      try {
        fs.copyFileSync(backupFile, stateFile);
        logger(`Product state restored from backup because primary file was missing`);
      } catch (error) {
        logger(`Product state backup restore failed: ${error.message}`);
      }
    }
    if (!fs.existsSync(stateFile)) return emptyProductState();

    try {
      return normalizeProductState(JSON.parse(fs.readFileSync(stateFile, 'utf8')));
    } catch (error) {
      logger(`Product state load failed: ${error.message}`);
      try { quarantineInvalid(stateFile); } catch (moveError) {
        logger(`Invalid product state quarantine failed: ${moveError.message}`);
      }

      if (fs.existsSync(backupFile)) {
        try {
          const recovered = normalizeProductState(JSON.parse(fs.readFileSync(backupFile, 'utf8')));
          try {
            fs.copyFileSync(backupFile, stateFile);
            logger(`Product state recovered from ${backupFile}`);
          } catch (copyError) {
            logger(`Recovered product state could not be copied to primary file: ${copyError.message}`);
          }
          return recovered;
        } catch (backupError) {
          logger(`Product state backup load failed: ${backupError.message}`);
          try { quarantineInvalid(backupFile, 'backup'); } catch (moveError) {
            logger(`Invalid product state backup quarantine failed: ${moveError.message}`);
          }
        }
      }
      return emptyProductState();
    }
  }

  function save(value) {
    const normalized = normalizeProductState(value);
    const tempFile = `${stateFile}.tmp`;
    const backupFile = `${stateFile}.bak`;
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(tempFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    try {
      if (fs.existsSync(backupFile)) fs.rmSync(backupFile, { force: true });
      if (fs.existsSync(stateFile)) fs.renameSync(stateFile, backupFile);
      fs.renameSync(tempFile, stateFile);
    } catch (error) {
      try {
        if (!fs.existsSync(stateFile) && fs.existsSync(backupFile)) {
          fs.copyFileSync(backupFile, stateFile);
        }
      } catch (_) {}
      try { fs.rmSync(tempFile, { force: true }); } catch (_) {}
      throw error;
    }
    return normalized;
  }

  return { load, save, stateFile };
}

module.exports = {
  PRODUCT_STATE_VERSION,
  createProductStateStore,
  emptyProductState,
  normalizeProductState,
};

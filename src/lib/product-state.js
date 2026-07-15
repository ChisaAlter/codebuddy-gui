export const PRODUCT_STATE_VERSION = 1;

export function emptyProductState() {
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

export function createEntityId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function projectNameFromPath(workspacePath) {
  const normalized = String(workspacePath || '').replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || '未命名项目';
}

export function createProjectRecord(workspacePath, overrides = {}) {
  const now = new Date().toISOString();
  const preferences = overrides.preferences && typeof overrides.preferences === 'object'
    ? overrides.preferences
    : {};
  return {
    id: overrides.id || createEntityId('project'),
    name: overrides.name || projectNameFromPath(workspacePath),
    workspacePath: String(workspacePath || ''),
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    lastOpenedAt: now,
    runtimeStatus: overrides.runtimeStatus || 'idle',
    preferences: {
      ...preferences,
      sidebarExpanded: preferences.sidebarExpanded !== false,
    },
  };
}

export function createThreadRecord(projectId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || createEntityId('thread'),
    projectId,
    sessionId: overrides.sessionId || null,
    title: overrides.title || '新对话',
    draft: overrides.draft || '',
    timeline: Array.isArray(overrides.timeline) ? overrides.timeline : [],
    status: overrides.status || 'idle',
    unread: Boolean(overrides.unread),
    pinned: Boolean(overrides.pinned),
    archivedAt: typeof overrides.archivedAt === 'string' && overrides.archivedAt
      ? overrides.archivedAt
      : null,
    modelId: overrides.modelId || null,
    modeId: overrides.modeId || 'default',
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    lastOpenedAt: now,
    metadata: overrides.metadata || {},
  };
}

function normalizeTimelineEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const historyMode = entry.raw?._meta?.['codebuddy.ai']?.mode === 'history';
  const rawText = entry.raw?.content?.text;
  const content = entry.content;
  if (!historyMode || typeof rawText !== 'string' || !rawText || typeof content !== 'string') return entry;
  const repeatCount = content.length / rawText.length;
  const repeatedContent = Number.isInteger(repeatCount)
    && repeatCount >= 2
    && rawText.repeat(repeatCount) === content;
  const metaText = entry.meta?.content?.text;
  const corruptedMeta = typeof metaText === 'string'
    && metaText.includes('\uFFFD')
    && !rawText.includes('\uFFFD');
  if (!repeatedContent && !corruptedMeta) return entry;
  return {
    ...entry,
    ...(repeatedContent ? { content: rawText } : {}),
    ...(corruptedMeta ? {
      meta: {
        ...entry.meta,
        content: { ...entry.meta.content, text: rawText },
      },
    } : {}),
  };
}

export function normalizeProductState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyProductState();

  const sourceProjects = value.projectsById && typeof value.projectsById === 'object'
    ? value.projectsById
    : {};
  const sourceThreads = value.threadsById && typeof value.threadsById === 'object'
    ? value.threadsById
    : {};
  const projectsById = Object.fromEntries(Object.entries(sourceProjects).map(([id, project]) => {
    const preferences = project?.preferences && typeof project.preferences === 'object'
      ? project.preferences
      : {};
    return [id, {
      ...project,
      preferences: {
        ...preferences,
        sidebarExpanded: preferences.sidebarExpanded !== false,
      },
    }];
  }));
  const threadsById = Object.fromEntries(Object.entries(sourceThreads).map(([id, thread]) => [id, {
    ...thread,
    timeline: Array.isArray(thread?.timeline) ? thread.timeline.map(normalizeTimelineEntry) : [],
    pinned: Boolean(thread?.pinned),
    archivedAt: typeof thread?.archivedAt === 'string' && thread.archivedAt
      ? thread.archivedAt
      : null,
  }]));
  const projectOrder = Array.isArray(value.projectOrder)
    ? value.projectOrder.filter((id) => typeof id === 'string' && projectsById[id])
    : [];
  const threadOrderByProject = {};

  for (const projectId of projectOrder) {
    const order = Array.isArray(value.threadOrderByProject?.[projectId])
      ? value.threadOrderByProject[projectId]
      : [];
    threadOrderByProject[projectId] = order.filter((threadId) => (
      typeof threadId === 'string' && threadsById[threadId]?.projectId === projectId
    ));
  }

  const activeProjectId = projectOrder.includes(value.activeProjectId)
    ? value.activeProjectId
    : (projectOrder[0] || null);
  const visibleThreadOrder = activeProjectId
    ? (threadOrderByProject[activeProjectId] || []).filter((threadId) => !threadsById[threadId]?.archivedAt)
    : [];
  const activeThreadId = visibleThreadOrder.includes(value.activeThreadId)
    ? value.activeThreadId
    : (visibleThreadOrder[0] || null);

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

export function productStateSnapshot(state) {
  return normalizeProductState({
    version: PRODUCT_STATE_VERSION,
    projectsById: state.projectsById,
    projectOrder: state.projectOrder,
    threadsById: state.threadsById,
    threadOrderByProject: state.threadOrderByProject,
    activeProjectId: state.activeProjectId,
    activeThreadId: state.activeThreadId,
  });
}

export function activeProject(state) {
  return state.projectsById?.[state.activeProjectId] || null;
}

export function activeThread(state) {
  return state.threadsById?.[state.activeThreadId] || null;
}

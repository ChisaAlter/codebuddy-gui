import {
  activeProject,
  activeThread,
  createProjectRecord,
  createThreadRecord,
  emptyProductState,
  normalizeProductState,
  productStateSnapshot,
} from '../../lib/product-state';
import { normalizeGuiSettings } from '../../lib/gui-settings';
import { reduceAcpEvent } from '../../lib/timeline';
import { emptyThreadRuntime } from '../helpers/thread-runtime';
import { terminalStateFromProject } from '../helpers/terminal-workspace-state';

/**
 * Product-state persistence and thread timeline/draft scheduling.
 * Module-level timer maps and productStateSaveChain are injected via ctx.
 */
export function createProductPersistSlice(set, get, ctx) {
  const {
    threadTimelinePersistTimers,
    threadDraftPersistTimers,
    terminalStatePersistTimers,
    workspaceStatePersistTimers,
    getProductStateSaveChain,
    setProductStateSaveChain,
    serializePromptQueue,
  } = ctx;

  return {
  async updateThreadRecord(threadId, patch) {
    if (!threadId || !get().threadsById[threadId]) return;
    const pendingDraftTimer = threadDraftPersistTimers.get(threadId);
    if (pendingDraftTimer) {
      clearTimeout(pendingDraftTimer);
      threadDraftPersistTimers.delete(threadId);
    }
    set((state) => ({
      threadsById: {
        ...state.threadsById,
        [threadId]: {
          ...state.threadsById[threadId],
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    await get().persistProductState();
  },

  appendThreadTimelineEvent(threadId, eventType, payload) {
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    get().patchThreadRuntime(threadId, {
      timeline: reduceAcpEvent(runtime.timeline, eventType, payload, threadId, {
        thinkingStartedAt: runtime.historyReplayActive ? null : runtime.promptStartedAt,
      }),
      isAwaitingResponse:
        eventType === 'agent_message_chunk' || eventType === 'agent_thought_chunk' || eventType === 'tool_call'
          ? false
          : runtime.isAwaitingResponse,
    });
    get().scheduleThreadTimelinePersist(threadId);
  },

  scheduleThreadTimelinePersist(threadId) {
    if (!threadId) return;
    const existing = threadTimelinePersistTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      threadTimelinePersistTimers.delete(threadId);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const thread = get().threadsById[threadId];
      if (!thread) return;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...state.threadsById[threadId],
            timeline: runtime.timeline.slice(-300),
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      await get().persistProductState();
    }, 600);
    threadTimelinePersistTimers.set(threadId, timer);
  },

  scheduleThreadDraftPersist(threadId) {
    if (!threadId) return;
    const existing = threadDraftPersistTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      threadDraftPersistTimers.delete(threadId);
      if (!get().threadsById[threadId]) return;
      await get().persistProductState();
    }, 350);
    threadDraftPersistTimers.set(threadId, timer);
  },

  async persistProductState() {
    const saveProductState = window.electronAPI?.saveProductState;
    if (!saveProductState) return false;
    const operation = getProductStateSaveChain()
      .catch(() => false)
      .then(async () => {
        try {
          await saveProductState(productStateSnapshot(get()));
          return true;
        } catch (error) {
          set({ error: `保存项目状态失败: ${error.message}` });
          return false;
        }
      });
    setProductStateSaveChain(operation);
    return operation;
  },

  flushProductStateSync() {
    const saveSync = window.electronAPI?.saveProductStateSync;
    if (!saveSync) return false;

    const pendingThreadIds = Array.from(threadTimelinePersistTimers.keys());
    for (const timer of threadTimelinePersistTimers.values()) clearTimeout(timer);
    threadTimelinePersistTimers.clear();

    for (const timer of threadDraftPersistTimers.values()) clearTimeout(timer);
    threadDraftPersistTimers.clear();

    const pendingTerminalStates = Array.from(terminalStatePersistTimers.entries());
    for (const [, pending] of pendingTerminalStates) clearTimeout(pending?.timer || pending);
    terminalStatePersistTimers.clear();

    const pendingWorkspaceStates = Array.from(workspaceStatePersistTimers.entries());
    for (const [, pending] of pendingWorkspaceStates) clearTimeout(pending?.timer || pending);
    workspaceStatePersistTimers.clear();

    if (pendingThreadIds.length || pendingTerminalStates.length || pendingWorkspaceStates.length) {
      set((state) => {
        const threadsById = { ...state.threadsById };
        const projectsById = { ...state.projectsById };
        const now = new Date().toISOString();

        for (const threadId of pendingThreadIds) {
          const thread = threadsById[threadId];
          if (!thread) continue;
          const runtime = state.threadRuntimeById[threadId] || emptyThreadRuntime();
          threadsById[threadId] = {
            ...thread,
            timeline: runtime.timeline.slice(-300),
            updatedAt: now,
          };
        }

        for (const [projectId, pending] of pendingTerminalStates) {
          const project = projectsById[projectId];
          const snapshot = pending?.snapshot;
          if (!project || !snapshot) continue;
          projectsById[projectId] = {
            ...project,
            preferences: {
              ...(project.preferences || {}),
              terminalState: {
                activePaneId: snapshot.activePaneId,
                panes: snapshot.panes.map((pane) => ({
                  ...pane,
                  output: String(pane.output || '').slice(-200000),
                })),
              },
            },
            updatedAt: now,
          };
        }

        for (const [projectId, pending] of pendingWorkspaceStates) {
          const project = projectsById[projectId];
          const snapshot = pending?.snapshot;
          if (!project || !snapshot) continue;
          projectsById[projectId] = {
            ...project,
            preferences: { ...(project.preferences || {}), workspaceState: snapshot },
            updatedAt: now,
          };
        }

        return { threadsById, projectsById };
      });
    }

    try {
      const result = saveSync(productStateSnapshot(get()));
      if (!result?.ok) {
        set({ error: `退出前保存项目状态失败: ${result?.error || '未知错误'}` });
        return false;
      }
      return true;
    } catch (error) {
      set({ error: `退出前保存项目状态失败: ${error.message}` });
      return false;
    }
  },

  async hydrateProductState() {
    let loaded = emptyProductState();
    try {
      if (window.electronAPI?.loadProductState) {
        loaded = normalizeProductState(await window.electronAPI.loadProductState());
      }
    } catch (error) {
      set({ error: `加载项目状态失败: ${error.message}` });
    }

    let legacyWorkspace = null;
    if (loaded.projectOrder.length === 0) {
      try {
        legacyWorkspace = localStorage.getItem('codebuddy-gui-workspace');
      } catch (_) {}
      if (legacyWorkspace) {
        const project = createProjectRecord(legacyWorkspace);
        const thread = createThreadRecord(project.id);
        loaded = {
          ...emptyProductState(),
          projectsById: { [project.id]: project },
          projectOrder: [project.id],
          threadsById: { [thread.id]: thread },
          threadOrderByProject: { [project.id]: [thread.id] },
          activeProjectId: project.id,
          activeThreadId: thread.id,
        };
      }
    }

    const project = activeProject(loaded);
    const thread = activeThread(loaded);
    const restoredProjects = Object.fromEntries(
      Object.entries(loaded.projectsById).map(([id, item]) => {
        const terminalState = terminalStateFromProject(item, true);
        return [
          id,
          {
            ...item,
            preferences: {
              ...(item.preferences || {}),
              terminalState,
            },
            runtimeStatus: 'idle',
            runtimePort: null,
            runtimePid: null,
            runtimeError: null,
            runtimeStartedAt: null,
          },
        ];
      }),
    );
    const restoredThreadRuntime = Object.fromEntries(
      Object.entries(loaded.threadsById).map(([id, item]) => [
        id,
        {
          ...emptyThreadRuntime(),
          timeline: Array.isArray(item.timeline) ? item.timeline : [],
          promptQueue: serializePromptQueue(item.metadata?.promptQueue),
          currentModel: item.modelId || null,
          currentMode: item.modeId || 'default',
        },
      ]),
    );
    const restoredTerminal = terminalStateFromProject(restoredProjects[project?.id], true);
    set({
      projectsById: restoredProjects,
      projectOrder: loaded.projectOrder,
      threadsById: loaded.threadsById,
      threadOrderByProject: loaded.threadOrderByProject,
      activeProjectId: loaded.activeProjectId,
      activeThreadId: loaded.activeThreadId,
      threadRuntimeById: restoredThreadRuntime,
      terminalPanes: restoredTerminal.panes,
      activePaneId: restoredTerminal.activePaneId,
      workspacePath: project?.workspacePath || null,
      fileCwd: project?.workspacePath || '.',
      sessionId: thread?.sessionId || null,
      sessionTitle: thread?.title || null,
      guiSettings: normalizeGuiSettings(loaded.guiSettings || get().guiSettings),
      currentModel: thread?.modelId || null,
      currentMode: thread?.modeId || 'default',
      productStateLoaded: true,
    });

    if (legacyWorkspace && window.electronAPI?.saveProductState) {
      await get().persistProductState();
    } else if (loaded.projectOrder.length > 0) {
      await get().persistProductState();
    }
  },

  };
}

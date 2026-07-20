import {
  getApiBase,
  setApiBase,
  fetchJson,
  requestCodeBuddy,
  getAcpSessionToken,
  getAuthToken,
  setAcpSessionToken,
  checkAuth as apiCheckAuth,
  authLogin as apiAuthLogin,
  authLogout as apiAuthLogout,
  setAuthToken,
  isAcpAuthenticationError,
} from '../../lib/acp';
import { closeAssistantStream, pushUserMessage, reduceAcpEvent, resetSeenContent } from '../../lib/timeline';
import {
  activeProject,
  activeThread,
  createThreadRecord,
} from '../../lib/product-state';
import { visibleProjectThreads } from '../../lib/session-sidebar';
import { deleteSession as apiDeleteSession, renameSession as apiRenameSession } from '../../lib/ops';
import { hasCompletePromptResponse, hasPromptRunActivity } from '../helpers/prompt-completion';
import {
  emptyThreadRuntime,
  responseTerminalRuntimePatch,
  sessionActionItemMatches,
  ACTIVE_THREAD_RUNTIME_KEYS,
} from '../helpers/thread-runtime';
import { resetProjectRuntimeViews } from '../helpers/terminal-workspace-state';

/**
 * Session lifecycle, conversation events, permissions, and prompt pipeline.
 */
export function createSessionsChatSlice(set, get, ctx) {
  const {
    conversations,
    // queues / helpers
    queueThreadMutation,
    queueSessionSettingOperation,
    runUniqueSessionAction,
    queuePromptQueueOperation,
    beginScopedRequest,
    isScopedRequestCurrent,
    beginProjectNavigation,
    isProjectNavigationCurrent,
    finishProjectNavigation,
    requestDirtyFileConfirmation,
    resetFileWorkspace,
    // pure helpers from store module
    serializePromptQueue,
    mergeAttachmentSelection,
    mergeTeamState,
    normalizeModels,
    normalizeModes,
    configOptionChoices,
    resolveAvailableSelection,
    threadResponseInProgress,
    threadSelectionProtection,
    cancelPendingTimelineActions,
    promptResultErrorMessage,
    waitForMilliseconds,
    isMethodNotFoundError,
    projectWithDeletedSession,
    RESPONSE_BUSY_STATUSES,
    PROMPT_CONTENT_SESSION_UPDATES,
    FINAL_RESPONSE_GRACE_MS,
  } = ctx;

  return {
  applySessionConfigUpdate(configOptions = [], { preserveModel = false, preserveMode = false } = {}) {
    const next = {};
    for (const option of configOptions) {
      if (option.id === 'model') {
        if (!preserveModel) next.currentModel = option.currentValue;
        const models = normalizeModels(configOptionChoices(option));
        if (models.length) next.models = models;
      }
      if (option.id === 'mode') {
        if (!preserveMode) next.currentMode = option.currentValue;
        const modes = normalizeModes(configOptionChoices(option));
        if (modes.length) next.modes = modes;
      }
      if (option.id === 'thought_level') next.thoughtLevel = option.currentValue;
    }
    return next;
  },

  handleSessionUpdate(update) {
    const su = update.sessionUpdate || update.session_update || update.type;
    if (!su) return;

    if (su === 'config_option_update') {
      const selectionProtection = threadSelectionProtection(get(), get().activeThreadId);
      const patch = get().applySessionConfigUpdate(update.configOptions || [], selectionProtection);
      set(patch);
      get().updateActiveThread({
        ...(patch.currentModel ? { modelId: patch.currentModel } : {}),
        ...(patch.currentMode ? { modeId: patch.currentMode } : {}),
      });
      return;
    }

    if (su === 'session_info_update') {
      const title = update.title || get().sessionTitle;
      set({ sessionTitle: title });
      if (title) get().updateActiveThread({ title });
      return;
    }

    if (su === 'usage_update') {
      set({ usage: { used: update.used, size: update.size, meta: update._meta || null } });
      return;
    }

    if (su === 'available_commands_update') {
      set({ availableCommands: update.availableCommands || [] });
      return;
    }

    if (su === 'interruption_request') {
      set((state) => ({ permissionRequests: [...state.permissionRequests, update] }));
      get().appendTimelineEvent(su, update);
      return;
    }

    if (su === 'question_request') {
      set((state) => ({ questions: [...state.questions, update] }));
      get().appendTimelineEvent(su, update);
      return;
    }

    // 内容事件：agent_message_chunk, agent_thought_chunk, tool_call, tool_call_update, status_change 等
    get().appendTimelineEvent(su || 'session/update', update);
  },

  handleThreadSessionUpdate(threadId, update) {
    const su = update.sessionUpdate || update.session_update || update.type;
    if (!su) return;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const metadata = update._meta && typeof update._meta === 'object' ? update._meta : {};
    const contentEvent = ['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update'].includes(su);
    if (contentEvent && get().threadsById[threadId]?.status === 'cancelled') return;
    const runtimePatch = {};
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/promptSuggestion')) {
      runtimePatch.promptSuggestion = metadata['codebuddy.ai/promptSuggestion'] || null;
    }
    if (metadata['codebuddy.ai/teamUpdate']) {
      runtimePatch.teamState = mergeTeamState(runtime.teamState, metadata['codebuddy.ai/teamUpdate']);
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/agentPhase')) {
      runtimePatch.agentPhase = metadata['codebuddy.ai/agentPhase'] || null;
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/progress')) {
      runtimePatch.progress = metadata['codebuddy.ai/progress'] || null;
    }
    if (metadata['codebuddy.ai/historyReplay'] === 'start') runtimePatch.historyReplayActive = true;
    if (metadata['codebuddy.ai/historyReplay'] === 'end') runtimePatch.historyReplayActive = false;
    if (Object.keys(runtimePatch).length) get().patchThreadRuntime(threadId, runtimePatch);

    if (metadata['codebuddy.ai/sessionReset'] && metadata['codebuddy.ai/newSessionId']) {
      get()
        .handleThreadSessionReset(threadId, metadata['codebuddy.ai/newSessionId'])
        .catch((error) => {
          console.warn('Failed to synchronize reset CodeBuddy session:', error);
        });
      return;
    }

    if (metadata['codebuddy.ai/permissionResolved']) {
      const interruptionId = metadata['codebuddy.ai/toolCallId'];
      const decision = metadata['codebuddy.ai/decision'];
      if (interruptionId && decision && get().applyInterruptionResolution(threadId, interruptionId, decision)) {
        get().persistProductState();
      }
    }

    for (const [metadataKey, eventType] of [
      ['codebuddy.ai/goalProgress', 'goal-progress'],
      ['codebuddy.ai/goalStatus', 'goal-status'],
    ]) {
      const goalEvent = metadata[metadataKey];
      if (!goalEvent || typeof goalEvent !== 'object') continue;
      const currentTimeline = get().threadRuntimeById[threadId]?.timeline || runtime.timeline;
      const duplicate =
        goalEvent.id &&
        currentTimeline.some(
          (item) => item.type === eventType && (item.meta?.id === goalEvent.id || item.raw?.id === goalEvent.id),
        );
      if (!duplicate) get().appendThreadTimelineEvent(threadId, eventType, { ...goalEvent, type: eventType });
    }

    if (su === 'config_option_update') {
      const selectionProtection = threadSelectionProtection(get(), threadId);
      const patch = get().applySessionConfigUpdate(update.configOptions || [], selectionProtection);
      get().patchThreadRuntime(threadId, patch);
      get().updateThreadRecord(threadId, {
        ...(patch.currentModel ? { modelId: patch.currentModel } : {}),
        ...(patch.currentMode ? { modeId: patch.currentMode } : {}),
      });
      return;
    }
    if (su === 'session_info_update') {
      if (update.title) get().updateThreadRecord(threadId, { title: update.title });
      if (get().activeThreadId === threadId) set({ sessionTitle: update.title || get().sessionTitle });
      return;
    }
    if (su === 'usage_update') {
      get().patchThreadRuntime(threadId, {
        usage: { used: update.used, size: update.size, meta: update._meta || null },
      });
      return;
    }
    if (su === 'available_commands_update') {
      get().patchThreadRuntime(threadId, { availableCommands: update.availableCommands || [] });
      return;
    }
    if (su === 'interruption_request') {
      const requestIds = [update.interruptionId, update.toolCallId].filter(Boolean);
      if (
        requestIds.some((requestId) =>
          runtime.permissionRequests.some((item) => sessionActionItemMatches(item, requestId)),
        )
      )
        return;
      get().patchThreadRuntime(threadId, { permissionRequests: [...runtime.permissionRequests, update] });
      get().appendThreadTimelineEvent(threadId, su, update);
      get().updateThreadRecord(threadId, { status: 'waiting', unread: get().activeThreadId !== threadId });
      return;
    }
    if (su === 'question_request') {
      const requestId = update.toolCallId;
      if (requestId && runtime.questions.some((item) => sessionActionItemMatches(item, requestId))) return;
      get().patchThreadRuntime(threadId, { questions: [...runtime.questions, update] });
      get().appendThreadTimelineEvent(threadId, su, update);
      get().updateThreadRecord(threadId, { status: 'waiting', unread: get().activeThreadId !== threadId });
      return;
    }
    if (su === 'status_change') {
      const rawStatus = update.status || update.state || '';
      const normalizedStatus = ['completed', 'complete', 'idle', 'ready'].includes(rawStatus)
        ? 'idle'
        : ['cancelled', 'canceled'].includes(rawStatus)
          ? 'cancelled'
          : ['error', 'failed'].includes(rawStatus)
            ? 'error'
            : rawStatus || 'running';
      if (['idle', 'error', 'cancelled'].includes(normalizedStatus)) {
        const latestRuntime = get().threadRuntimeById[threadId] || runtime;
        const client = conversations.peek(threadId) || get().getThreadClient(threadId);
        const sessionId = get().threadsById[threadId]?.sessionId || latestRuntime.sessionId;
        const requestStillActive = Boolean(
          latestRuntime.activePromptRunId && client?.hasActivePrompt?.(sessionId),
        );
        if (!requestStillActive) {
          get().patchThreadRuntime(
            threadId,
            responseTerminalRuntimePatch({ timeline: closeAssistantStream(latestRuntime.timeline) }),
          );
        }
      }
      get().updateThreadRecord(threadId, {
        status: normalizedStatus,
        unread: get().activeThreadId !== threadId && ['idle', 'error', 'cancelled'].includes(normalizedStatus),
      });
    }
    get().appendThreadTimelineEvent(threadId, su, update);
  },

  handleConversationEvent({ threadId, type, detail }) {
    const thread = get().threadsById[threadId];
    const eventSessionId = detail?.sessionId || null;
    if (eventSessionId && thread?.sessionId && eventSessionId !== thread.sessionId) return;

    const client = conversations.peek(threadId);
    if (type === 'connected') {
      get().patchThreadRuntime(threadId, {
        connectionState: 'connected',
        agentPhase: null,
        progress: null,
        historyReplayActive: false,
      });
      if (get().activeThreadId === threadId) {
        set({ sessionToken: client?.sessionToken || null, error: null });
        setAcpSessionToken(client?.sessionToken || null);
      }
      return;
    }
    if (type === 'reconnecting') {
      get().patchThreadRuntime(threadId, { connectionState: 'reconnecting' });
      return;
    }
    if (type === 'reconnected') {
      get().patchThreadRuntime(threadId, { connectionState: 'connected' });
      return;
    }
    if (type === 'reconnect_failed') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      get().patchThreadRuntime(
        threadId,
        responseTerminalRuntimePatch({
          connectionState: 'error',
          timeline: closeAssistantStream(runtime.timeline),
        }),
      );
      get().updateThreadRecord(threadId, { status: 'error', unread: get().activeThreadId !== threadId });
      return;
    }
    if (type === 'session/update') {
      const update = (detail || {}).update || {};
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const promptRunId = detail?._client?.promptRunId || null;
      const sessionUpdate = update.sessionUpdate || update.session_update || update.type;
      const promptContentEvent = PROMPT_CONTENT_SESSION_UPDATES.has(sessionUpdate);
      if (promptContentEvent && promptRunId && promptRunId !== runtime.activePromptRunId) return;
      if (promptContentEvent && !promptRunId && runtime.activePromptRunId && !runtime.historyReplayActive) return;
      if (
        promptContentEvent &&
        !promptRunId &&
        !runtime.activePromptRunId &&
        !runtime.isAwaitingResponse &&
        !runtime.historyReplayActive &&
        !['connecting', 'running', 'waiting'].includes(thread?.status)
      ) {
        return;
      }
      get().handleThreadSessionUpdate(threadId, update);
      return;
    }
    if (type === 'initialized') {
      get().patchThreadRuntime(threadId, { capabilities: detail?.agentCapabilities || detail || {} });
      return;
    }
    if (type === 'interruption_request' || type === 'question_request') {
      get().handleThreadSessionUpdate(threadId, { ...(detail || {}), sessionUpdate: type });
      return;
    }
    if (type === 'interaction_requests_invalidated') {
      const interruptionIds = new Set(detail?.interruptionIds || []);
      const questionToolCallIds = new Set(detail?.questionToolCallIds || []);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const invalidatedAt = Date.now();
      const invalidates = (item) =>
        (item.type === 'interruption' &&
          Array.from(interruptionIds).some((id) => sessionActionItemMatches(item, id))) ||
        (item.type === 'question' && Array.from(questionToolCallIds).some((id) => sessionActionItemMatches(item, id)));
      const timeline = runtime.timeline.map((item) =>
        invalidates(item) && !['resolved', 'answered', 'cancelled', 'expired'].includes(item.status)
          ? {
              ...item,
              status: 'expired',
              meta: {
                ...(item.meta || {}),
                invalidatedAt,
                invalidationReason: detail?.reason || 'connection-replaced',
              },
            }
          : item,
      );
      const permissionRequests = runtime.permissionRequests.filter(
        (item) => !Array.from(interruptionIds).some((id) => sessionActionItemMatches(item, id)),
      );
      const questions = runtime.questions.filter(
        (item) => !Array.from(questionToolCallIds).some((id) => sessionActionItemMatches(item, id)),
      );
      const changed =
        permissionRequests.length !== runtime.permissionRequests.length ||
        questions.length !== runtime.questions.length ||
        timeline.some((item, index) => item !== runtime.timeline[index]);
      if (!changed) return;
      get().patchThreadRuntime(threadId, { permissionRequests, questions, timeline });
      const message = '连接已更换，之前待处理的权限或问题请求已失效。';
      set((state) => {
        const record = state.threadsById[threadId];
        if (!record) return {};
        return {
          threadsById: {
            ...state.threadsById,
            [threadId]: {
              ...record,
              timeline: timeline.slice(-300),
              status: record.status === 'waiting' ? 'error' : record.status,
              metadata: { ...(record.metadata || {}), lastError: message },
              updatedAt: new Date().toISOString(),
            },
          },
          ...(state.activeThreadId === threadId ? { error: message } : {}),
        };
      });
      get().persistProductState();
      return;
    }
    if (type === 'model_update') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const { preserveModel } = threadSelectionProtection(get(), threadId);
      const currentModel = preserveModel ? runtime.currentModel : detail?.currentModelId || runtime.currentModel;
      get().patchThreadRuntime(threadId, {
        models: normalizeModels(detail?.availableModels || runtime.models),
        currentModel,
      });
      if (!preserveModel) get().updateThreadRecord(threadId, { modelId: currentModel });
      return;
    }
    if (type === 'mode_update' || type === 'current_mode_update') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const { preserveMode } = threadSelectionProtection(get(), threadId);
      const currentMode = preserveMode ? runtime.currentMode : detail?.currentModeId || runtime.currentMode;
      get().patchThreadRuntime(threadId, {
        ...(type === 'mode_update' ? { modes: normalizeModes(detail?.availableModes || runtime.modes) } : {}),
        currentMode,
      });
      if (!preserveMode) get().updateThreadRecord(threadId, { modeId: currentMode });
      return;
    }
    if (type === 'promptSuggestion') {
      get().patchThreadRuntime(threadId, { promptSuggestion: detail });
      return;
    }
    if (type === 'teamUpdate') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      get().patchThreadRuntime(threadId, { teamState: mergeTeamState(runtime.teamState, detail) });
      return;
    }
    get().appendThreadTimelineEvent(threadId, type === '_codebuddy.ai/artifact' ? 'artifact' : type, detail);
  },

  async initializeActiveThread(sessionIdOverride) {
    const project = activeProject(get());
    const thread = activeThread(get());
    if (!project || !thread) {
      set({ connectionState: 'disconnected' });
      return false;
    }
    const request = beginScopedRequest('initializeActiveThread', get(), 'threadId');

    const existingClient = conversations.peek(thread.id);
    if (existingClient?.connected && existingClient?.initialized && thread.sessionId) {
      get().activateThreadRuntime(thread.id);
      set({
        sessionId: thread.sessionId,
        sessionTitle: thread.title,
        workspacePath: project.workspacePath,
        connectionState: existingClient.connectionState,
      });
      await get().updateThreadRecord(thread.id, { unread: false, lastOpenedAt: new Date().toISOString() });
      return isScopedRequestCurrent(request, get());
    }

    const client = get().getThreadClient(thread.id);
    if (!client) {
      set({ connectionState: 'error', error: '项目运行时尚未就绪' });
      return false;
    }

    resetSeenContent(thread.id);
    const requestedSessionId = sessionIdOverride === undefined ? thread.sessionId : sessionIdOverride;
    set({
      sessionId: requestedSessionId || null,
      timeline: closeAssistantStream(Array.isArray(thread.timeline) ? thread.timeline : []),
      permissionRequests: [],
      questions: [],
      sessionTitle: thread.title || null,
      usage: null,
      availableCommands: [],
      workspacePath: project.workspacePath,
      connectionState: 'connecting',
    });
    const preservedRuntime = get().threadRuntimeById[thread.id] || emptyThreadRuntime();
    const preservedPromptQueue = preservedRuntime.promptQueue?.length
      ? preservedRuntime.promptQueue
      : serializePromptQueue(thread.metadata?.promptQueue);
    get().patchThreadRuntime(thread.id, {
      ...emptyThreadRuntime(),
      timeline: closeAssistantStream((preservedRuntime.timeline || thread.timeline || []).slice(-300)),
      promptQueue: preservedPromptQueue,
      pendingAttachments: preservedRuntime.pendingAttachments || [],
      promptSuggestion: preservedRuntime.promptSuggestion || null,
      connectionState: 'connecting',
      currentModel: thread.modelId || null,
      currentMode: thread.modeId || 'default',
    });
    await get().updateActiveThread({ status: 'connecting', lastOpenedAt: new Date().toISOString() });

    const applyInitializedSession = async (init, loaded, recoveryError = null) => {
      const threadRuntime = get().threadRuntimeById[thread.id] || emptyThreadRuntime();
      const configPatch = get().applySessionConfigUpdate(
        loaded?.configOptions || init?.configOptions || init?.agentCapabilities?.configOptions || [],
      );
      const availableModels =
        loaded?.models?.availableModels ||
        init?.models?.availableModels ||
        init?.agentCapabilities?.availableModels ||
        configPatch.models ||
        threadRuntime.models;
      const normalizedModels = normalizeModels(availableModels);
      const persistedModel = thread.modelId || threadRuntime.currentModel;
      const currentModel =
        resolveAvailableSelection(normalizedModels, persistedModel) ||
        loaded?.models?.currentModelId ||
        init?.models?.currentModelId ||
        configPatch.currentModel;
      const availableModes =
        loaded?.modes?.availableModes || init?.modes?.availableModes || configPatch.modes || threadRuntime.modes;
      const normalizedModes = normalizeModes(availableModes);
      const persistedMode = thread.modeId || threadRuntime.currentMode;
      const currentMode =
        resolveAvailableSelection(normalizedModes, persistedMode) ||
        loaded?.modes?.currentModeId ||
        init?.modes?.currentModeId ||
        configPatch.currentMode ||
        'default';
      const resolvedSessionId = loaded?.sessionId || (recoveryError ? null : requestedSessionId) || null;
      const resolvedTitle = loaded?.title || loaded?.name || thread.title || '新对话';
      const stillActive = isScopedRequestCurrent(request, get());

      if (stillActive) {
        set({
          sessionId: resolvedSessionId,
          sessionTitle: resolvedTitle,
          currentModel,
          models: normalizedModels,
          modes: normalizedModes,
          currentMode,
          connectionState: 'connected',
          error: null,
          codeBuddyAccountAuthState: 'authenticated',
          codeBuddyAccountAuthUrl: null,
          codeBuddyAccountAuthError: null,
        });
      }
      const completedTimeline = closeAssistantStream(threadRuntime.timeline);
      get().patchThreadRuntime(thread.id, {
        sessionId: resolvedSessionId,
        connectionState: 'connected',
        currentModel,
        models: normalizedModels,
        modes: normalizedModes,
        currentMode,
        capabilities: init?.agentCapabilities || threadRuntime.capabilities || {},
        timeline: completedTimeline,
        isAwaitingResponse: false,
        promptStartedAt: null,
        activePromptRunId: null,
        historyReplayActive: false,
        agentPhase: null,
        progress: null,
      });
      await get().updateThreadRecord(thread.id, {
        sessionId: resolvedSessionId,
        title: resolvedTitle,
        modelId: currentModel || null,
        modeId: currentMode || 'default',
        status: 'idle',
        unread: false,
        timeline: completedTimeline.slice(-300),
        metadata: recoveryError
          ? {
              ...(thread.metadata || {}),
              previousSessionId: requestedSessionId,
              recoveryError,
              recoveredAt: new Date().toISOString(),
              lastError: null,
            }
          : { ...(thread.metadata || {}), lastError: null },
      });
      if (recoveryError) {
        const currentTimeline = get().threadRuntimeById[thread.id]?.timeline || [];
        const warning = `原会话恢复失败，已创建新会话继续工作。${recoveryError}`;
        if (!currentTimeline.some((item) => item.content === warning))
          get().appendThreadTimelineEvent(thread.id, 'error', {
            type: 'error',
            message: warning,
          });
      }
      return isScopedRequestCurrent(request, get());
    };

    try {
      const knownRecoveryError = thread.metadata?.lastError || thread.metadata?.recoveryError || '';
      if (requestedSessionId && /(timeout|408)/i.test(knownRecoveryError)) {
        await client.connect();
        const init = await client.initialize();
        const loaded = await client.request('session/new', { cwd: project.workspacePath || '.', mcpServers: [] });
        return await applyInitializedSession(init, loaded, knownRecoveryError);
      }
      const { init, loaded } = await client.initializeSession(requestedSessionId || null, project.workspacePath || '.');
      return await applyInitializedSession(init, loaded);
    } catch (error) {
      if (isAcpAuthenticationError(error)) {
        const stillActive = isScopedRequestCurrent(request, get());
        if (stillActive) {
          set({
            error: null,
            connectionState: client.connected ? 'connected' : 'disconnected',
            codeBuddyAccountAuthState: 'required',
            codeBuddyAccountAuthUrl: null,
            codeBuddyAccountAuthError: null,
            codeBuddyAccountAuthMethods: client.authMethods || [],
          });
        }
        get().patchThreadRuntime(thread.id, {
          connectionState: client.connected ? 'connected' : 'disconnected',
        });
        await get().updateThreadRecord(thread.id, {
          status: 'disconnected',
          metadata: { ...(thread.metadata || {}), lastError: '需要登录 CodeBuddy 账号' },
        });
        return false;
      }
      if (requestedSessionId) {
        try {
          const loaded = await client.request('session/new', { cwd: project.workspacePath || '.', mcpServers: [] });
          return await applyInitializedSession(null, loaded, error.message);
        } catch (_) {}
      }
      const stillActive = isScopedRequestCurrent(request, get());
      if (stillActive) set({ error: error.message, connectionState: 'error' });
      get().patchThreadRuntime(thread.id, { connectionState: 'error' });
      await get().updateThreadRecord(thread.id, {
        status: 'error',
        metadata: { ...(thread.metadata || {}), lastError: error.message },
      });
      return false;
    }
  },

  async activateThread(threadId) {
    if (isProjectMutationNavigation(get())) return false;
    const thread = get().threadsById[threadId];
    const project = thread ? get().projectsById[thread.projectId] : null;
    if (!thread || !project || thread.archivedAt) return false;
    if (threadId === get().activeThreadId) return true;
    const navigation = beginProjectNavigation(set, `thread:${threadId}`);
    try {
      const projectChanged = thread.projectId !== get().activeProjectId;
      if (projectChanged) {
        const confirmed = await requestDirtyFileConfirmation(set, get, '切换项目');
        if (!isProjectNavigationCurrent(navigation) || !confirmed) return false;
        await get().persistActiveProjectWorkspaceState({ discardDirty: true });
        if (!isProjectNavigationCurrent(navigation)) return false;
        await get().persistActiveProjectTerminalState();
        if (!isProjectNavigationCurrent(navigation)) return false;
      }
      const currentThread = get().threadsById[threadId];
      const currentProject = get().projectsById[project.id];
      if (!currentThread || !currentProject || currentThread.projectId !== project.id) return false;
      set({
        activeProjectId: project.id,
        activeThreadId: thread.id,
        workspacePath: project.workspacePath,
        ...(projectChanged ? resetProjectRuntimeViews() : {}),
        ...(projectChanged ? resetFileWorkspace(project.workspacePath) : {}),
      });
      if (projectChanged) get().loadProjectTerminalState(project.id);
      get().activateThreadRuntime(thread.id);
      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) throw new Error(get().error || '保存会话状态失败');
      const runtime = await get().ensureProjectRuntime(project.id);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!runtime) throw new Error(get().error || '项目运行时启动失败');
      if (projectChanged) {
        const opened = await get().initializeWorkspace();
        if (!isProjectNavigationCurrent(navigation)) return false;
        if (!opened) throw new Error(get().error || '恢复项目工作区失败');
      }
      const initialized = await get().initializeActiveThread(thread.sessionId);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!initialized) throw new Error(get().error || '会话连接失败');
      if (projectChanged) await get().refreshProjectViews();
      else await Promise.allSettled([get().refreshStats(), get().refreshTasks()]);
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const message = error?.message || '切换会话失败';
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return false;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  async renameThread(threadId, name) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      const projectId = thread?.projectId;
      const title = String(name || '').trim();
      if (!thread || !title) return false;
      if (thread.sessionId) {
        if (projectId !== get().activeProjectId) return false;
        try {
          await apiRenameSession(thread.sessionId, title);
        } catch (error) {
          if (projectId === get().activeProjectId) set({ error: error.message || '重命名会话失败' });
          return false;
        }
      }
      if (!get().threadsById[threadId]) return false;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: { ...state.threadsById[threadId], title, updatedAt: new Date().toISOString() },
        },
        sessionTitle: state.activeThreadId === threadId ? title : state.sessionTitle,
        sessions: state.sessions.map((session) =>
          (session.id || session.sessionId) === thread.sessionId ? { ...session, name: title } : session,
        ),
      }));
      await get().persistProductState();
      return true;
    });
  },

  async setProjectSidebarExpanded(projectId, expanded) {
    const project = get().projectsById[projectId];
    if (!project) return false;
    const previous = project.preferences?.sidebarExpanded !== false;
    const nextExpanded = Boolean(expanded);
    if (previous === nextExpanded) return true;
    set((state) => ({
      projectsById: {
        ...state.projectsById,
        [projectId]: {
          ...state.projectsById[projectId],
          preferences: {
            ...(state.projectsById[projectId].preferences || {}),
            sidebarExpanded: nextExpanded,
          },
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const persisted = await get().persistProductState();
    if (persisted) return true;
    set((state) => {
      const current = state.projectsById[projectId];
      if (!current || current.preferences?.sidebarExpanded !== nextExpanded) return {};
      return {
        projectsById: {
          ...state.projectsById,
          [projectId]: {
            ...current,
            preferences: { ...(current.preferences || {}), sidebarExpanded: previous },
          },
        },
      };
    });
    return false;
  },

  async setThreadPinned(threadId, pinned) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.archivedAt) return false;
      const previous = Boolean(thread.pinned);
      const nextPinned = Boolean(pinned);
      if (previous === nextPinned) return true;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...state.threadsById[threadId],
            pinned: nextPinned,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      const persisted = await get().persistProductState();
      if (persisted) return true;
      set((state) => {
        const current = state.threadsById[threadId];
        if (!current || Boolean(current.pinned) !== nextPinned) return {};
        return {
          threadsById: {
            ...state.threadsById,
            [threadId]: { ...current, pinned: previous },
          },
        };
      });
      return false;
    });
  },

  async archiveThread(threadId) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.archivedAt) return false;
      const archivedAt = new Date().toISOString();
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: { ...state.threadsById[threadId], archivedAt, unread: false, updatedAt: archivedAt },
        },
      }));
      const persisted = await get().persistProductState();
      if (!persisted) {
        set((state) => {
          const current = state.threadsById[threadId];
          if (!current || current.archivedAt !== archivedAt) return {};
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: { ...current, archivedAt: null, unread: thread.unread },
            },
          };
        });
        return false;
      }
      if (get().activeThreadId === threadId) {
        const replacement = visibleProjectThreads(thread.projectId, get().threadOrderByProject, get().threadsById)[0];
        if (replacement) await get().activateThread(replacement.id);
        else await get().newSession();
      }
      return true;
    });
  },

  async restoreThread(threadId) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread?.archivedAt) return false;
      const previousArchivedAt = thread.archivedAt;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...state.threadsById[threadId],
            archivedAt: null,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      const persisted = await get().persistProductState();
      if (persisted) return true;
      set((state) => {
        const current = state.threadsById[threadId];
        if (!current || current.archivedAt !== null) return {};
        return {
          threadsById: {
            ...state.threadsById,
            [threadId]: { ...current, archivedAt: previousArchivedAt },
          },
        };
      });
      return false;
    });
  },

  async deleteThread(threadId) {
    return queueThreadMutation(threadId, async () => {
      const previousState = get();
      const thread = previousState.threadsById[threadId];
      const projectId = thread?.projectId;
      if (!thread) return false;
      const project = previousState.projectsById[projectId];
      if (!project) return false;
      const wasActive = previousState.activeThreadId === threadId;
      const order = (previousState.threadOrderByProject[projectId] || []).filter((id) => id !== threadId);
      const replacementId = order.find((id) => !previousState.threadsById[id]?.archivedAt) || null;
      const previousRuntime = previousState.threadRuntimeById[threadId] || null;
      const previousActiveRuntime = {};
      if (wasActive) {
        for (const key of ACTIVE_THREAD_RUNTIME_KEYS) previousActiveRuntime[key] = previousState[key];
      }

      await conversations.dispose(threadId);
      set((state) => {
        const threadsById = { ...state.threadsById };
        const threadRuntimeById = { ...state.threadRuntimeById };
        const projectsById = { ...state.projectsById };
        delete threadsById[threadId];
        delete threadRuntimeById[threadId];
        if (thread.sessionId) {
          projectsById[projectId] = projectWithDeletedSession(state.projectsById[projectId], thread.sessionId);
        }
        return {
          projectsById,
          threadsById,
          threadRuntimeById,
          threadOrderByProject: { ...state.threadOrderByProject, [thread.projectId]: order },
          sessions: state.sessions.filter((session) => (session.id || session.sessionId) !== thread.sessionId),
          activeThreadId: wasActive ? null : state.activeThreadId,
          ...(wasActive
            ? {
                ...emptyThreadRuntime(),
                sessionId: null,
                sessionTitle: null,
                sessionToken: null,
              }
            : {}),
        };
      });
      if (wasActive) setAcpSessionToken(null);

      const persisted = await get().persistProductState();
      if (!persisted) {
        set((state) => {
          const threadRuntimeById = { ...state.threadRuntimeById };
          if (previousRuntime) threadRuntimeById[threadId] = previousRuntime;
          else delete threadRuntimeById[threadId];
          return {
            projectsById: { ...state.projectsById, [projectId]: project },
            threadsById: { ...state.threadsById, [threadId]: thread },
            threadRuntimeById,
            threadOrderByProject: {
              ...state.threadOrderByProject,
              [projectId]: previousState.threadOrderByProject[projectId] || [],
            },
            sessions: previousState.sessions,
            activeThreadId: previousState.activeThreadId,
            ...(wasActive
              ? {
                  ...previousActiveRuntime,
                  sessionId: previousState.sessionId,
                  sessionTitle: previousState.sessionTitle,
                  sessionToken: previousState.sessionToken,
                }
              : {}),
          };
        });
        if (wasActive) setAcpSessionToken(previousState.sessionToken || null);
        return false;
      }

      if (thread.sessionId && projectId === get().activeProjectId) {
        apiDeleteSession(thread.sessionId).catch((error) => {
          console.warn('Failed to delete CodeBuddy session after local removal:', error);
        });
      }

      if (wasActive) {
        queueMicrotask(async () => {
          if (get().activeThreadId || get().activeProjectId !== projectId) return;
          if (replacementId && get().threadsById[replacementId]) {
            await get().activateThread(replacementId);
          } else {
            await get().newSession();
          }
        });
      }
      return true;
    });
  },

  async setModel(modelId) {
    const state = get();
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!threadId || !sessionId || !modelId) return false;
    if (threadResponseInProgress(state, threadId)) {
      set({ error: '当前回复进行中，请等待完成或停止后再切换模型' });
      return false;
    }
    return queueSessionSettingOperation(`${threadId}:model`, async () => {
      const target = get().threadsById[threadId];
      if (!target || target.sessionId !== sessionId) return false;
      if (threadResponseInProgress(get(), threadId)) {
        if (get().activeThreadId === threadId) set({ error: '当前回复进行中，请等待完成或停止后再切换模型' });
        return false;
      }
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        await client.request('session/set_model', { sessionId, modelId });
        const thread = get().threadsById[threadId];
        if (!thread || thread.sessionId !== sessionId) return false;
        get().patchThreadRuntime(threadId, { currentModel: modelId });
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ currentModel: modelId });
        await get().updateThreadRecord(threadId, { modelId });
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async setMode(modeId) {
    const state = get();
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!threadId || !sessionId || !modeId) return false;
    if (threadResponseInProgress(state, threadId)) {
      set({ error: '当前回复进行中，请等待完成或停止后再切换模式' });
      return false;
    }
    return queueSessionSettingOperation(`${threadId}:mode`, async () => {
      const target = get().threadsById[threadId];
      if (!target || target.sessionId !== sessionId) return false;
      if (threadResponseInProgress(get(), threadId)) {
        if (get().activeThreadId === threadId) set({ error: '当前回复进行中，请等待完成或停止后再切换模式' });
        return false;
      }
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        await client.request('session/set_mode', { sessionId, modeId });
        const thread = get().threadsById[threadId];
        if (!thread || thread.sessionId !== sessionId) return false;
        get().patchThreadRuntime(threadId, { currentMode: modeId });
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ currentMode: modeId });
        await get().updateThreadRecord(threadId, { modeId });
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async newSession() {
    const reportNewSessionError = (message) => {
      const text = String(message || '创建新会话失败').trim() || '创建新会话失败';
      set({ newSessionError: text });
      if (typeof get().pushToast === 'function') {
        get().pushToast({ type: 'error', message: text });
      }
    };

    if (get().projectNavigationBusy) {
      reportNewSessionError('请等待项目或会话切换完成');
      return false;
    }
    if (get().newSessionBusy) return false;
    const projectId = get().activeProjectId;
    const previousThreadId = get().activeThreadId;
    let thread = null;
    set({ newSessionBusy: true, newSessionProjectId: projectId, newSessionError: null, error: null });
    try {
      if (!projectId) {
        await get().chooseWorkspace();
        const created = Boolean(get().activeThreadId);
        if (!created) reportNewSessionError(get().error || '未能创建新会话');
        return created;
      }

      thread = createThreadRecord(projectId);
      set((state) => ({
        threadsById: { ...state.threadsById, [thread.id]: thread },
        threadOrderByProject: {
          ...state.threadOrderByProject,
          [projectId]: [...(state.threadOrderByProject[projectId] || []), thread.id],
        },
        activeThreadId: thread.id,
      }));

      const persisted = await get().persistProductState();
      if (!persisted) {
        let failureMessage = '保存新会话失败';
        set((state) => {
          const threadsById = { ...state.threadsById };
          delete threadsById[thread.id];
          failureMessage = state.error || failureMessage;
          return {
            threadsById,
            threadOrderByProject: {
              ...state.threadOrderByProject,
              [projectId]: (state.threadOrderByProject[projectId] || []).filter((id) => id !== thread.id),
            },
            activeThreadId: state.activeThreadId === thread.id ? previousThreadId : state.activeThreadId,
            newSessionError: failureMessage,
          };
        });
        if (typeof get().pushToast === 'function') {
          get().pushToast({ type: 'error', message: failureMessage });
        }
        return false;
      }

      if (get().activeProjectId !== projectId || get().activeThreadId !== thread.id) return true;
      const initialized = await get().initializeActiveThread(null);
      if (!initialized && get().activeProjectId === projectId && get().activeThreadId === thread.id) {
        reportNewSessionError(get().error || '新会话连接失败，请重试');
      }
      return initialized;
    } catch (error) {
      if (get().activeProjectId === projectId) reportNewSessionError(error?.message || '创建新会话失败');
      return false;
    } finally {
      set({ newSessionBusy: false });
    }
  },

  applyInterruptionResolution(threadId, interruptionId, decision, resolvedAt = Date.now()) {
    if (!threadId || !interruptionId) return false;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    let timelineChanged = false;
    const timeline = runtime.timeline.map((item) => {
      if (item.type !== 'interruption' || !sessionActionItemMatches(item, interruptionId)) return item;
      if (item.status === 'resolved' && item.meta?.resolution === decision) return item;
      timelineChanged = true;
      return {
        ...item,
        status: 'resolved',
        meta: { ...(item.meta || {}), resolution: decision, resolvedAt },
      };
    });
    const permissionRequests = runtime.permissionRequests.filter(
      (item) => !sessionActionItemMatches(item, interruptionId),
    );
    if (!timelineChanged && permissionRequests.length === runtime.permissionRequests.length) return false;
    get().patchThreadRuntime(threadId, { permissionRequests, timeline });
    set((state) => {
      const record = state.threadsById[threadId];
      if (!record) return {};
      const stillWaiting = permissionRequests.length > 0 || runtime.questions.length > 0;
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...record,
            timeline: timeline.slice(-300),
            status: record.status === 'waiting' && !stillWaiting ? 'running' : record.status,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    return true;
  },

  async respondToInterruption(interruptionId, decision = 'allow', toolCallId = null) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !interruptionId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':interruption:' + interruptionId, async () => {
      const thread = get().threadsById[threadId];
      if (
        !thread ||
        thread.projectId !== projectId ||
        thread.sessionId !== sessionId ||
        !['running', 'waiting'].includes(thread.status)
      )
        return false;
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const target = runtime.timeline.find(
        (item) => item.type === 'interruption' && sessionActionItemMatches(item, interruptionId),
      );
      const resolvedToolCallId =
        toolCallId || target?.toolCallId || target?.meta?.toolCallId || target?.raw?.toolCallId || null;
      const client = get().getThreadClient(threadId);
      if (!client) {
        set({ error: '当前会话未连接' });
        return false;
      }
      const errors = [];
      let handled = false;
      try {
        handled = await client.respondToPermissionRequest(interruptionId, resolvedToolCallId, decision);
      } catch (error) {
        errors.push(error);
      }
      const extensionToolCallId = resolvedToolCallId || interruptionId;
      if (extensionToolCallId) {
        try {
          await client.request('_codebuddy.ai/resolveInterruption', {
            sessionId,
            toolCallId: extensionToolCallId,
            decision,
          });
          handled = true;
        } catch (error) {
          errors.push(error);
        }
      }
      if (!handled) {
        const error = errors[0] || new Error('权限请求已失效或无法响应');
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
      const currentThread = get().threadsById[threadId];
      if (!currentThread || currentThread.sessionId !== sessionId) return true;
      get().applyInterruptionResolution(threadId, interruptionId, decision);
      await get().persistProductState();
      return true;
    });
  },

  applyQuestionResolution(threadId, toolCallId, status, answers = null) {
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    let timelineChanged = false;
    const timeline = runtime.timeline.map((item) => {
      if (item.type !== 'question' || !sessionActionItemMatches(item, toolCallId)) return item;
      timelineChanged = true;
      return {
        ...item,
        status,
        meta: {
          ...(item.meta || {}),
          ...(answers ? { submittedAnswers: answers } : {}),
          [status === 'answered' ? 'answeredAt' : 'cancelledAt']: Date.now(),
        },
      };
    });
    const questions = runtime.questions.filter((item) => !sessionActionItemMatches(item, toolCallId));
    if (!timelineChanged && questions.length === runtime.questions.length) return false;
    get().patchThreadRuntime(threadId, { questions, timeline });
    set((state) => {
      const record = state.threadsById[threadId];
      if (!record) return {};
      const stillWaiting = questions.length > 0 || runtime.permissionRequests.length > 0;
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...record,
            timeline: timeline.slice(-300),
            status: record.status === 'waiting' && !stillWaiting ? 'running' : record.status,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    return true;
  },

  async submitQuestionAnswers(toolCallId, answers) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !toolCallId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':question:' + toolCallId, async () => {
      const thread = get().threadsById[threadId];
      if (
        !thread ||
        thread.projectId !== projectId ||
        thread.sessionId !== sessionId ||
        !['running', 'waiting'].includes(thread.status)
      )
        return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        const responded = await client.submitQuestionAnswers(toolCallId, answers);
        if (!responded) {
          await client.request('_codebuddy.ai/answerQuestion', { sessionId, toolCallId, answers });
        }
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== sessionId) return true;
        get().applyQuestionResolution(threadId, toolCallId, 'answered', answers);
        await get().persistProductState();
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async cancelQuestionAnswers(toolCallId) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !toolCallId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':question:' + toolCallId, async () => {
      const thread = get().threadsById[threadId];
      if (
        !thread ||
        thread.projectId !== projectId ||
        thread.sessionId !== sessionId ||
        !['running', 'waiting'].includes(thread.status)
      )
        return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        const cancelled = await client.cancelQuestionAnswers(toolCallId);
        if (!cancelled) throw new Error('当前问题不支持取消，请提交答案');
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== sessionId) return true;
        get().applyQuestionResolution(threadId, toolCallId, 'cancelled');
        await get().persistProductState();
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async cancelSession() {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const thread = state.threadsById[threadId];
    const runtime = state.threadRuntimeById[threadId] || emptyThreadRuntime();
    const sessionId = thread?.sessionId || runtime.sessionId || state.sessionId;
    if (!projectId || !threadId || !sessionId || !thread) return false;
    set({ error: null });
    return runUniqueSessionAction(`${threadId}:cancel:${sessionId}`, async () => {
      const currentThread = get().threadsById[threadId];
      const currentRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      if (!currentThread || currentThread.projectId !== projectId) return false;
      const currentSessionId = currentThread.sessionId || currentRuntime.sessionId || get().sessionId;
      if (currentSessionId !== sessionId) return false;
      const client = get().getThreadClient(threadId);
      if (!client) {
        set({ error: '当前会话未连接' });
        return false;
      }

      const hadPlannedRun = Boolean(currentRuntime.activePromptRunId);
      const hadActiveRequest = Boolean(client.hasActivePrompt?.(sessionId));
      const waitingForInput = currentThread.status === 'waiting';
      const responseBusy = RESPONSE_BUSY_STATUSES.has(currentThread.status);
      if (!hadPlannedRun && !hadActiveRequest && !waitingForInput && !responseBusy) return false;
      const preflightOnly =
        hadPlannedRun && !currentRuntime.promptDispatched && !hadActiveRequest && currentThread.status === 'running';
      const backendMayBeRunning = !preflightOnly && (currentRuntime.promptDispatched || hadActiveRequest || responseBusy);

      get().patchThreadRuntime(threadId, responseTerminalRuntimePatch());
      await get().updateThreadRecord(threadId, { status: 'cancelling' });

      client.cancelActivePrompt?.(sessionId);
      let backendCancelWarning = null;
      if (backendMayBeRunning && client.notify && client.sessionCancelSupported !== false) {
        try {
          await client.notify('session/cancel', { sessionId });
          client.sessionCancelSupported = true;
        } catch (error) {
          if (isMethodNotFoundError(error)) {
            client.sessionCancelSupported = false;
          } else {
            backendCancelWarning = `后端取消确认失败，已关闭本地请求流: ${error?.message || '未知错误'}`;
          }
        }
      }

      client.invalidateInteractiveRequests?.('session-cancelled');
      const latestRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const cancelledTimeline = cancelPendingTimelineActions(closeAssistantStream(latestRuntime.timeline));
      const timeline = reduceAcpEvent(cancelledTimeline, 'status_change', {
        status: 'cancelled',
        role: 'system',
      }, threadId);
      get().patchThreadRuntime(
        threadId,
        responseTerminalRuntimePatch({
          permissionRequests: [],
          questions: [],
          timeline,
        }),
      );
      await get().updateThreadRecord(threadId, {
        status: 'cancelled',
        timeline: timeline.slice(-300),
        metadata: {
          ...(get().threadsById[threadId]?.metadata || {}),
          lastError: null,
          cancelWarning: backendCancelWarning,
        },
      });
      if (get().activeThreadId === threadId) set({ error: null });
      return true;
    });
  },
  setThreadPromptQueue(threadId, promptQueue, patch = {}) {
    const serializedQueue = serializePromptQueue(promptQueue);
    set((state) => {
      const thread = state.threadsById[threadId];
      if (!thread) return {};
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...thread,
            ...patch,
            metadata: { ...(thread.metadata || {}), promptQueue: serializedQueue },
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  async persistThreadPromptQueue(threadId, promptQueue, patch = {}) {
    if (!get().threadsById[threadId]) return false;
    get().setThreadPromptQueue(threadId, promptQueue, patch);
    return get().persistProductState();
  },

  async sendPrompt(text) {
    const threadId = get().activeThreadId;
    const thread = get().threadsById[threadId];
    const client = get().getThreadClient(threadId);
    if (!thread || !client) {
      set({ error: '当前会话未连接' });
      return false;
    }
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const attachments = runtime.pendingAttachments || [];
    const draftText = String(text || '');
    const content = String(text || '').trim() || (attachments.length ? '请查看附件。' : '');
    if (!content) return false;
    if (RESPONSE_BUSY_STATUSES.has(thread.status) || runtime.isAwaitingResponse || runtime.activePromptRunId || runtime.promptQueue.length > 0) {
      return queuePromptQueueOperation(threadId, async () => {
        const latestThread = get().threadsById[threadId];
        const latestRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
        if (!latestThread) return false;
        const queuedPrompt = {
          id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: content,
          attachments,
          draftText,
          createdAt: Date.now(),
        };
        const promptQueue = [...latestRuntime.promptQueue, queuedPrompt];
        get().patchThreadRuntime(threadId, { promptQueue, pendingAttachments: [], promptSuggestion: null });
        const persisted = await get().persistThreadPromptQueue(threadId, promptQueue, { draft: '' });
        if (!persisted) {
          get().patchThreadRuntime(threadId, {
            promptQueue: latestRuntime.promptQueue,
            pendingAttachments: attachments,
            promptSuggestion: latestRuntime.promptSuggestion,
          });
          get().setThreadPromptQueue(threadId, latestRuntime.promptQueue, { draft: draftText });
          return false;
        }
        if (!RESPONSE_BUSY_STATUSES.has(latestThread.status) && !latestRuntime.isAwaitingResponse) {
          setTimeout(() => get().drainThreadPromptQueue(threadId), 0);
        }
        return { queued: true, id: queuedPrompt.id };
      });
    }
    get().patchThreadRuntime(threadId, { pendingAttachments: [], promptSuggestion: null });
    return get().runThreadPrompt(threadId, content, attachments, draftText);
  },

  async runThreadPrompt(threadId, content, attachments = [], draftText = content) {
    const thread = get().threadsById[threadId];
    const client = get().getThreadClient(threadId);
    if (!thread || !client) {
      const currentRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const restoredAttachments = [...attachments, ...(currentRuntime.pendingAttachments || [])].filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) => candidate.path === item.path && candidate.name === item.name && candidate.kind === item.kind,
          ) === index,
      );
      get().patchThreadRuntime(threadId, { pendingAttachments: restoredAttachments });
      set({ error: '当前会话未连接' });
      return false;
    }
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const requestSessionId =
      thread.sessionId || runtime.sessionId || (get().activeThreadId === threadId ? get().sessionId : null);
    if (!requestSessionId) {
      set({ error: '当前会话尚未完成连接' });
      return false;
    }
    const project = get().projectsById[thread.projectId];
    const attachmentLabel = attachments.length ? `\n\n[附件: ${attachments.map((item) => item.name).join(', ')}]` : '';
    const promptStartedAt = Date.now();
    const activePromptRunId = `run-${promptStartedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const timeline = pushUserMessage(runtime.timeline, `${content}${attachmentLabel}`, promptStartedAt);
    const promptEntryId = timeline[timeline.length - 1]?.id || null;
    get().patchThreadRuntime(threadId, {
      timeline,
      isAwaitingResponse: true,
      promptStartedAt,
      activePromptRunId,
      promptDispatched: false,
    });
    await get().updateThreadRecord(threadId, {
      status: 'running',
      draft: '',
      unread: false,
      timeline: timeline.slice(-300),
      metadata: { ...(thread.metadata || {}), lastError: null },
    });

    const runIsCurrent = () => {
      const latestThread = get().threadsById[threadId];
      const latestRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const latestSessionId = latestThread?.sessionId || latestRuntime.sessionId;
      return latestRuntime.activePromptRunId === activePromptRunId && latestSessionId === requestSessionId;
    };

    const hasFinalResponse = () =>
      hasCompletePromptResponse(get().threadRuntimeById[threadId]?.timeline, promptEntryId, promptStartedAt);
    const recoverPromptHistory = async () => {
      if (!runIsCurrent()) return false;
      get().patchThreadRuntime(threadId, { historyReplayActive: true });
      resetSeenContent(threadId);
      try {
        await client.request(
          'session/load',
          {
            sessionId: requestSessionId,
            cwd: project?.workspacePath || '.',
            mcpServers: [],
          },
          { promptRunId: activePromptRunId, historyReplay: true },
        );
      } finally {
        const latestRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
        if (latestRuntime.activePromptRunId === activePromptRunId) {
          get().patchThreadRuntime(threadId, { historyReplayActive: false });
        }
      }
      return hasFinalResponse();
    };
    try {
      if (!runIsCurrent() || ['cancelled', 'cancelling'].includes(get().threadsById[threadId]?.status)) return false;
      const prompt = [{ type: 'text', text: content }];
      for (const attachment of attachments) {
        if (attachment.kind === 'image') {
          prompt.push({ type: 'image', data: attachment.data, mimeType: attachment.mimeType });
        } else if (attachment.kind === 'text') {
          const text = String(attachment.text || '');
          const clipped = text.length > 500000 ? `${text.slice(0, 500000)}\n\n[文件内容已截断]` : text;
          prompt.push({ type: 'text', text: `文件: ${attachment.name}\n路径: ${attachment.path}\n\n${clipped}` });
        }
      }
      get().patchThreadRuntime(threadId, { promptDispatched: true });
      let result;
      try {
        result = await client.request(
          'session/prompt',
          {
            sessionId: requestSessionId,
            prompt,
          },
          { promptRunId: activePromptRunId },
        );
      } catch (requestError) {
        if (!runIsCurrent()) return false;
        const transportAccepted = requestError.promptAccepted === true;
        const activityBeforeRecovery = hasPromptRunActivity(
          get().threadRuntimeById[threadId]?.timeline,
          promptEntryId,
          promptStartedAt,
        );
        let recovered = false;
        try {
          recovered = await recoverPromptHistory();
        } catch (recoveryError) {
          if (hasFinalResponse()) {
            recovered = true;
          } else {
            const promptAccepted =
              transportAccepted ||
              activityBeforeRecovery ||
              hasPromptRunActivity(get().threadRuntimeById[threadId]?.timeline, promptEntryId, promptStartedAt);
            if (promptAccepted) {
              recoveryError.promptAccepted = true;
              throw recoveryError;
            }
            requestError.promptAccepted = false;
            requestError.recoveryError = recoveryError?.message || null;
            throw requestError;
          }
        }
        if (!recovered) {
          requestError.promptAccepted =
            transportAccepted ||
            activityBeforeRecovery ||
            hasPromptRunActivity(get().threadRuntimeById[threadId]?.timeline, promptEntryId, promptStartedAt);
          throw requestError;
        }
        result = { stopReason: 'recovered' };
      }
      if (!runIsCurrent()) return false;

      if (result?.stopReason === 'cancelled') {
        const cancelledRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
        const cancelledTimeline = closeAssistantStream(cancelledRuntime.timeline);
        get().patchThreadRuntime(
          threadId,
          responseTerminalRuntimePatch({ timeline: cancelledTimeline }),
        );
        await get().updateThreadRecord(threadId, {
          status: 'cancelled',
          timeline: cancelledTimeline.slice(-300),
        });
        return false;
      }
      if (result?.stopReason === 'refusal') throw new Error(promptResultErrorMessage(result));

      const graceDeadline = Date.now() + FINAL_RESPONSE_GRACE_MS;
      while (runIsCurrent() && !hasFinalResponse() && Date.now() < graceDeadline) {
        await waitForMilliseconds(25);
      }

      if (runIsCurrent() && !hasFinalResponse()) await recoverPromptHistory();
      if (!runIsCurrent()) return false;
      if (!hasFinalResponse()) {
        const incompleteError = new Error('回复已结束，但最终正文未送达；自动历史恢复也未找到完整回答。');
        incompleteError.promptAccepted = true;
        throw incompleteError;
      }

      const completedRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const completedTimeline = closeAssistantStream(completedRuntime.timeline);
      get().patchThreadRuntime(
        threadId,
        responseTerminalRuntimePatch({ timeline: completedTimeline }),
      );
      await get().updateThreadRecord(threadId, {
        status: 'idle',
        unread: get().activeThreadId !== threadId,
        timeline: completedTimeline.slice(-300),
        metadata: { ...(get().threadsById[threadId]?.metadata || {}), lastError: null },
      });
      if ((get().threadRuntimeById[threadId]?.promptQueue || []).length > 0) {
        setTimeout(() => get().drainThreadPromptQueue(threadId), 0);
      } else {
        get().notifyThreadResult(threadId, 'success');
      }
      return true;
    } catch (error) {
      const failedRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const currentThread = get().threadsById[threadId] || thread;
      const userCancelled =
        ['cancelled', 'cancelling'].includes(currentThread.status) ||
        /cancelled|canceled|aborted by user|用户取消|已取消/i.test(error.message || '');
      if (userCancelled) {
        if (failedRuntime.activePromptRunId === activePromptRunId) {
          get().patchThreadRuntime(
            threadId,
            responseTerminalRuntimePatch({ timeline: closeAssistantStream(failedRuntime.timeline) }),
          );
        }
        return false;
      }
      if (!runIsCurrent()) return false;

      const restoreInput = error.promptAccepted !== true;
      const failedDraft = restoreInput ? String(draftText || '').trim() : '';
      const currentDraft = String(currentThread.draft || '').trim();
      const restoredDraft = failedDraft && currentDraft ? `${failedDraft}\n\n${currentDraft}` : failedDraft || currentDraft;
      const restoredAttachments = restoreInput
        ? [...attachments, ...(failedRuntime.pendingAttachments || [])].filter(
            (item, index, items) =>
              items.findIndex(
                (candidate) =>
                  candidate.path === item.path && candidate.name === item.name && candidate.kind === item.kind,
              ) === index,
          )
        : failedRuntime.pendingAttachments || [];
      const failedTimeline = closeAssistantStream(
        reduceAcpEvent(failedRuntime.timeline, 'error', { message: error.message, type: 'error' }, threadId),
      );
      get().patchThreadRuntime(
        threadId,
        responseTerminalRuntimePatch({
          timeline: failedTimeline,
          pendingAttachments: restoredAttachments,
        }),
      );
      await get().updateThreadRecord(threadId, {
        status: 'error',
        unread: get().activeThreadId !== threadId,
        draft: restoredDraft,
        timeline: failedTimeline.slice(-300),
        metadata: { ...(currentThread.metadata || {}), lastError: error.message },
      });
      if (get().activeThreadId === threadId) set({ error: error.message });
      get().notifyThreadResult(threadId, 'error');
      return false;
    }
  },
  async drainThreadPromptQueue(threadId) {
    const prepared = await queuePromptQueueOperation(threadId, async () => {
      const thread = get().threadsById[threadId];
      const client = get().getThreadClient(threadId);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const [next, ...rest] = runtime.promptQueue;
      if (!thread || !client || !next) return null;
      if (RESPONSE_BUSY_STATUSES.has(thread.status) || runtime.isAwaitingResponse || runtime.activePromptRunId) return null;

      let attachments = Array.isArray(next.attachments) ? next.attachments : [];
      const requiresReload = attachments.some(
        (attachment) =>
          (attachment.kind === 'image' && !attachment.data) ||
          (attachment.kind === 'text' && typeof attachment.text !== 'string'),
      );
      if (requiresReload) {
        if (!window.electronAPI?.readAttachments) {
          set({ error: '无法恢复待发送附件：桌面文件读取接口不可用' });
          return null;
        }
        const loaded = await window.electronAPI.readAttachments(attachments.map((attachment) => attachment.path));
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== thread.sessionId) return null;
        const rejected = (loaded || []).filter((attachment) => attachment.kind === 'unsupported');
        if (rejected.length) {
          set({
            error: `无法恢复待发送附件：${rejected.map((attachment) => `${attachment.name}: ${attachment.error}`).join('；')}`,
          });
          return null;
        }
        const loadedByPath = new Map((loaded || []).map((attachment) => [attachment.path, attachment]));
        attachments = attachments.map((attachment) => loadedByPath.get(attachment.path)).filter(Boolean);
        if (attachments.length !== next.attachments.length) {
          set({ error: '无法恢复全部待发送附件，请确认文件仍在原位置' });
          return null;
        }
        const imageSupported = Boolean(
          runtime.capabilities?.promptCapabilities?.image || runtime.capabilities?.prompt_capabilities?.image,
        );
        if (!imageSupported && attachments.some((attachment) => attachment.kind === 'image')) {
          set({ error: '当前运行时未声明图片输入能力，无法继续发送队列中的图片' });
          return null;
        }
      }

      get().patchThreadRuntime(threadId, { promptQueue: rest });
      const persisted = await get().persistThreadPromptQueue(threadId, rest);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
        return null;
      }
      return { next, attachments };
    });
    if (!prepared) return false;
    return get().runThreadPrompt(
      threadId,
      prepared.next.text,
      prepared.attachments,
      prepared.next.draftText ?? prepared.next.text,
    );
  },

  async moveQueuedPrompt(threadId, promptId, direction) {
    if (!threadId || !promptId || !['up', 'down'].includes(direction)) return false;
    return queuePromptQueueOperation(threadId, async () => {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const index = runtime.promptQueue.findIndex((item) => item.id === promptId);
      if (index < 0) return false;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= runtime.promptQueue.length) return true;
      const promptQueue = [...runtime.promptQueue];
      [promptQueue[index], promptQueue[targetIndex]] = [promptQueue[targetIndex], promptQueue[index]];
      get().patchThreadRuntime(threadId, { promptQueue });
      const persisted = await get().persistThreadPromptQueue(threadId, promptQueue);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
      }
      return persisted;
    });
  },

  async removeQueuedPrompt(threadId, promptId) {
    return queuePromptQueueOperation(threadId, async () => {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const promptQueue = runtime.promptQueue.filter((item) => item.id !== promptId);
      if (promptQueue.length === runtime.promptQueue.length) return true;
      get().patchThreadRuntime(threadId, { promptQueue });
      const persisted = await get().persistThreadPromptQueue(threadId, promptQueue);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
      }
      return persisted;
    });
  },

  // ===== 鉴权 action（对照源 viewState/login/logout）=====
  };
}

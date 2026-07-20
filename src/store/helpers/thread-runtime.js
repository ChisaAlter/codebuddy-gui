export function emptyThreadRuntime() {
  return {
    connectionState: 'disconnected',
    timeline: [],
    permissionRequests: [],
    questions: [],
    usage: null,
    availableCommands: [],
    isAwaitingResponse: false,
    promptStartedAt: null,
    activePromptRunId: null,
    promptDispatched: false,
    promptQueue: [],
    pendingAttachments: [],
    promptSuggestion: null,
    teamState: null,
    agentPhase: null,
    progress: null,
    historyReplayActive: false,
    models: [],
    modes: [],
    currentModel: null,
    currentMode: 'default',
    capabilities: {},
  };
}

export const ACTIVE_THREAD_RUNTIME_KEYS = [
  'connectionState',
  'timeline',
  'permissionRequests',
  'questions',
  'usage',
  'availableCommands',
  'isAwaitingResponse',
  'promptStartedAt',
  'activePromptRunId',
  'promptDispatched',
  'promptQueue',
  'pendingAttachments',
  'promptSuggestion',
  'teamState',
  'agentPhase',
  'progress',
  'historyReplayActive',
  'models',
  'modes',
  'currentModel',
  'currentMode',
  'capabilities',
];

export function responseTerminalRuntimePatch(patch = {}) {
  return {
    activePromptRunId: null,
    promptDispatched: false,
    isAwaitingResponse: false,
    promptStartedAt: null,
    historyReplayActive: false,
    agentPhase: null,
    progress: null,
    ...patch,
  };
}

export function sessionActionItemMatches(item, id) {
  if (!id) return false;
  return [
    item?.interruptionId,
    item?.toolCallId,
    item?.meta?.interruptionId,
    item?.meta?.toolCallId,
    item?.raw?.interruptionId,
    item?.raw?.toolCallId,
  ].includes(id);
}

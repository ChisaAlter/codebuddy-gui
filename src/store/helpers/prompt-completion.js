export function promptTurnEntries(timeline, promptEntryId, promptStartedAt) {
  const entries = Array.isArray(timeline) ? timeline : [];
  let promptIndex = entries.findIndex((item) => item.id === promptEntryId);
  if (promptIndex < 0) {
    promptIndex = entries.findIndex(
      (item) => item.type === 'message' && item.role === 'user' && item.createdAt >= promptStartedAt,
    );
  }
  return promptIndex < 0 ? null : entries.slice(promptIndex + 1);
}

export function hasCompletePromptResponse(timeline, promptEntryId, promptStartedAt) {
  const turnEntries = promptTurnEntries(timeline, promptEntryId, promptStartedAt);
  if (!turnEntries) return false;
  let lastExecutionIndex = -1;
  for (let index = 0; index < turnEntries.length; index += 1) {
    if (turnEntries[index]?.type === 'tool_call') lastExecutionIndex = index;
  }
  return turnEntries.some(
    (item, index) =>
      index > lastExecutionIndex &&
      item?.type === 'message' &&
      item?.role === 'assistant' &&
      String(item.content || '').trim().length > 0,
  );
}

export function hasPromptRunActivity(timeline, promptEntryId, promptStartedAt) {
  const turnEntries = promptTurnEntries(timeline, promptEntryId, promptStartedAt);
  if (!turnEntries) return false;
  return turnEntries.some((item) => {
    if (item?.type === 'message' && item?.role === 'assistant') return true;
    return ['thinking', 'tool_call', 'interruption', 'question'].includes(item?.type);
  });
}

function orderedProjectThreads(projectId, threadOrderByProject, threadsById) {
  return (threadOrderByProject?.[projectId] || [])
    .map((threadId) => threadsById?.[threadId])
    .filter((thread) => thread?.projectId === projectId);
}

export function projectSidebarExpanded(project) {
  return project?.preferences?.sidebarExpanded !== false;
}

export function visibleProjectThreads(projectId, threadOrderByProject, threadsById) {
  const threads = orderedProjectThreads(projectId, threadOrderByProject, threadsById)
    .filter((thread) => !thread.archivedAt);
  const pinned = threads.filter((thread) => thread.pinned);
  const unpinned = threads.filter((thread) => !thread.pinned);
  return [...pinned, ...unpinned];
}

export function archivedProjectThreads(projectId, threadOrderByProject, threadsById) {
  return orderedProjectThreads(projectId, threadOrderByProject, threadsById)
    .filter((thread) => Boolean(thread.archivedAt));
}

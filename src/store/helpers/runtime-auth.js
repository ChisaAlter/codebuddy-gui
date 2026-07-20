export function runtimeAuthScopeChanged(previousBase, nextBase) {
  return Boolean(previousBase && nextBase && previousBase !== nextBase);
}

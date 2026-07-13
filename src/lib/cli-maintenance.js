function requireCliMaintenanceApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('CodeBuddy CLI 维护接口不可用');
  return api;
}

export async function getCliMaintenanceInfo() {
  return requireCliMaintenanceApi('getCliMaintenanceInfo')();
}

export async function runCliDoctor() {
  return requireCliMaintenanceApi('runCliDoctor')();
}

export async function updateCodeBuddyCli() {
  return requireCliMaintenanceApi('updateCodeBuddyCli')();
}

export const INTERNAL_VARIABLE_KEYS = new Set(["agentPlanning", "designTheme", "interactions", "structurePurposes", "visualAssets", "visualRepairNotes"]);

export function isUserVariableKey(key: string) {
  return !INTERNAL_VARIABLE_KEYS.has(key);
}

export function isUserVariablePath(path: string) {
  return isUserVariableKey(path.split(".")[0] ?? "");
}

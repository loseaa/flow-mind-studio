export type McpCredentials = { token?: string; headers?: Record<string, string> };
export type McpServerRecord = {
  id: string; organizationId: string; name: string; description: string | null; transport: "streamable_http";
  endpoint: string; authType: "none" | "bearer" | "headers"; encryptedCredentials: string | null;
  enabled: boolean; healthStatus: "unknown" | "online" | "offline" | "error"; protocolVersion: string | null;
  serverCapabilities: Record<string, unknown>; lastSyncedAt: string | null; lastCheckedAt: string | null;
  lastErrorCode: string | null; lastErrorMessage: string | null; createdBy: string; createdAt: string; updatedAt: string;
};
export type McpToolRecord = {
  id: string; serverId: string; remoteName: string; displayName: string | null; description: string | null;
  inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> | null; annotations: Record<string, unknown>;
  schemaHash: string; enabled: boolean; availability: "available" | "missing" | "invalid";
  riskLevel: "low" | "medium" | "high"; riskSource: "inferred" | "manual"; requiresConfirmation: boolean;
};

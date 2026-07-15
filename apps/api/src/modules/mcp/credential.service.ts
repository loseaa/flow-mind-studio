import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { McpCredentials } from "./mcp.types";

@Injectable()
export class CredentialService {
  private readonly key: Buffer;
  constructor(config: ConfigService) {
    const secret = config.get<string>("MCP_CREDENTIAL_ENCRYPTION_KEY") ?? (config.get<string>("NODE_ENV") === "production" ? "" : "flowmind-development-only-key");
    if (!secret) throw new Error("MCP_CREDENTIAL_ENCRYPTION_KEY is required in production");
    this.key = createHash("sha256").update(secret).digest();
  }
  encrypt(value?: McpCredentials): string | null {
    if (!value || (!value.token && !Object.keys(value.headers ?? {}).length)) return null;
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
  }
  decrypt(value: string | null): McpCredentials {
    if (!value) return {};
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted MCP credential");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8")) as McpCredentials;
  }
}

import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { ToolExecutorService } from "./tool-executor.service";

describe("ToolExecutorService",()=>{
  function setup(){const db={query:vi.fn(async()=>({rows:[]}))};const repo={dbService:()=>db} as any;const registry={resolve:vi.fn(async()=>({id:"tool_1",serverId:"server_1",remoteName:"update",inputSchema:{type:"object",required:["customerId"],properties:{customerId:{type:"string"}},additionalProperties:false},riskLevel:"medium",requiresConfirmation:true,schemaHash:"hash"}))} as any;const client={} as any;const config={get:()=>"1024"} as unknown as ConfigService;return{service:new ToolExecutorService(repo,registry,client,config),db,registry};}
  it("rejects arguments that do not match the discovered JSON Schema",async()=>{const {service,db}=setup();await expect(service.propose({organizationId:"org_1",modelName:"tool",arguments:{customerId:123},conversationId:"conv",requestMessageId:"msg",idempotencyKey:"key"})).rejects.toThrow("MCP_TOOL_INPUT_INVALID");expect(db.query).not.toHaveBeenCalled();});
  it("accepts valid arguments before creating an invocation",async()=>{const {service,db}=setup();db.query.mockResolvedValueOnce({rows:[{id:"inv_1"}]});await service.propose({organizationId:"org_1",modelName:"tool",arguments:{customerId:"cus_1"},conversationId:"conv",requestMessageId:"msg",idempotencyKey:"key"});expect(db.query).toHaveBeenCalledTimes(2);});
});

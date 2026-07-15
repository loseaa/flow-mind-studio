import { describe, expect, it } from "vitest";
import { ToolRegistryService } from "./tool-registry.service";

describe("ToolRegistryService",()=>{
  it("keeps the semantic remote tool name within the OpenAI 64 character limit",()=>{const registry=new ToolRegistryService({} as never);const name=registry.modelName("mcp_srv_42f6c23b-a18e-4e0d-a80b-42e5998274d1","update_customer_stage");expect(name).toMatch(/^mcp__[a-f0-9]{8}__update_customer_stage$/);expect(name.length).toBeLessThanOrEqual(64);});
});

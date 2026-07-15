import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { ConfigService } from "@nestjs/config";
import { CredentialService } from "./credential.service";
import { McpClientService } from "./mcp-client.service";
import type { McpServerRecord } from "./mcp.types";

describe("McpClientService Streamable HTTP",()=>{
  let http:HttpServer,endpoint:string,client:McpClientService;
  beforeAll(async()=>{
    http=createServer(async(req,res)=>{const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});const server=new McpServer({name:"test-mcp",version:"1.0.0"});server.registerTool("echo",{description:"Echo input",inputSchema:{message:z.string()},annotations:{readOnlyHint:true}},({message})=>({content:[{type:"text",text:message}]}));res.on("close",()=>void Promise.all([transport.close(),server.close()]));await server.connect(transport);await transport.handleRequest(req,res);});
    await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));const address=http.address();if(!address||typeof address==="string")throw new Error("No test address");endpoint=`http://127.0.0.1:${address.port}/mcp`;
    const config={get:(key:string)=>({NODE_ENV:"test",MCP_ALLOW_PRIVATE_NETWORKS:"true",MCP_CALL_TIMEOUT_MS:"3000",MCP_CREDENTIAL_ENCRYPTION_KEY:"test-key"} as Record<string,string>)[key]} as ConfigService;client=new McpClientService(new CredentialService(config),config);
  });
  afterAll(()=>new Promise<void>(resolve=>http.close(()=>resolve())));
  const record=():McpServerRecord=>({id:"server",organizationId:"org_1",name:"test",description:null,transport:"streamable_http",endpoint,authType:"none",encryptedCredentials:null,enabled:true,healthStatus:"online",protocolVersion:null,serverCapabilities:{},lastSyncedAt:null,lastCheckedAt:null,lastErrorCode:null,lastErrorMessage:null,createdBy:"user",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  it("discovers and invokes a real Streamable HTTP tool",async()=>{const tools=await client.listTools(record());expect(tools.tools.map(tool=>tool.name)).toContain("echo");const output=await client.callTool(record(),"echo",{message:"hello MCP"});expect(output.content).toContainEqual({type:"text",text:"hello MCP"});});
});

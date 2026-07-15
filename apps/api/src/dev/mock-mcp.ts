import "reflect-metadata";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const customers = [
  { id: "cus_001", name: "星云科技", stage: "方案中", owner: "Ada", amount: 128000 },
  { id: "cus_002", name: "远航制造", stage: "线索", owner: "Ben", amount: 86400 },
  { id: "cus_003", name: "北辰零售", stage: "成交", owner: "Chen", amount: 241000 }
];
const tickets = [
  { id: "ticket_101", title: "无法导出月报", priority: "high", status: "open", assignee: "Ada" },
  { id: "ticket_102", title: "成员邀请邮件延迟", priority: "medium", status: "processing", assignee: "Ben" }
];

function result(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: { data: value } }; }

function crmServer() {
  const server = new McpServer({ name: "flowmind-mock-crm", version: "1.0.0" });
  server.registerTool("search_customers", { description: "按客户名称查询 CRM 客户，安全的只读操作。", inputSchema: { keyword: z.string().optional() }, annotations: { readOnlyHint: true, destructiveHint: false } }, ({ keyword }) => result(customers.filter(item => !keyword || item.name.includes(keyword))));
  server.registerTool("get_customer", { description: "根据客户 ID 获取客户详情。", inputSchema: { customerId: z.string() }, annotations: { readOnlyHint: true } }, ({ customerId }) => result(customers.find(item => item.id === customerId) ?? { error: "CUSTOMER_NOT_FOUND" }));
  server.registerTool("update_customer_stage", { description: "修改客户销售阶段，需要人工确认。", inputSchema: { customerId: z.string(), stage: z.enum(["线索", "方案中", "成交", "流失"]) }, annotations: { readOnlyHint: false, destructiveHint: false } }, ({ customerId, stage }) => { const customer=customers.find(item=>item.id===customerId); if(!customer)return result({error:"CUSTOMER_NOT_FOUND"}); customer.stage=stage; return result({ok:true,customer}); });
  return server;
}

function ticketServer() {
  const server = new McpServer({ name: "flowmind-mock-tickets", version: "1.0.0" });
  server.registerTool("list_tickets", { description: "查询工单列表。", inputSchema: { status: z.enum(["open", "processing", "closed"]).optional() }, annotations: { readOnlyHint: true } }, ({ status }) => result(tickets.filter(item=>!status||item.status===status)));
  server.registerTool("create_ticket", { description: "创建一条新工单，需要确认。", inputSchema: { title: z.string().min(2), priority: z.enum(["low", "medium", "high"]) }, annotations: { readOnlyHint: false } }, ({ title, priority }) => { const ticket={id:`ticket_${100+tickets.length+1}`,title,priority,status:"open",assignee:"未分配"};tickets.push(ticket);return result({ok:true,ticket}); });
  server.registerTool("delete_ticket", { description: "永久删除工单，高风险操作。", inputSchema: { ticketId: z.string() }, annotations: { destructiveHint: true } }, ({ ticketId }) => { const index=tickets.findIndex(item=>item.id===ticketId);if(index<0)return result({error:"TICKET_NOT_FOUND"});return result({ok:true,deleted:tickets.splice(index,1)[0]}); });
  return server;
}

function analyticsServer() {
  const server = new McpServer({ name: "flowmind-mock-analytics", version: "1.0.0" });
  server.registerTool("sales_summary", { description: "返回销售汇总指标。", inputSchema: { period: z.enum(["today", "week", "month"]).default("month") }, annotations: { readOnlyHint: true } }, ({ period }) => result({period,revenue:455400,customers:3,won:1,conversionRate:0.333}));
  server.registerTool("top_customers", { description: "按合同金额返回重点客户。", inputSchema: { limit: z.number().int().min(1).max(10).default(3) }, annotations: { readOnlyHint: true } }, ({ limit }) => result([...customers].sort((a,b)=>b.amount-a.amount).slice(0,limit)));
  return server;
}

const factories: Record<string, () => McpServer> = { "/crm/mcp": crmServer, "/tickets/mcp": ticketServer, "/analytics/mcp": analyticsServer };
const httpServer=createServer(async(req:IncomingMessage,res:ServerResponse)=>{
  const path=new URL(req.url??"/",`http://${req.headers.host??"localhost"}`).pathname;
  if(path==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({status:"ok",endpoints:Object.keys(factories)}));return;}
  const factory=factories[path];if(!factory){res.writeHead(404);res.end("Not found");return;}
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});const server=factory();
  res.on("close",()=>void Promise.all([transport.close(),server.close()]));
  await server.connect(transport);await transport.handleRequest(req,res);
});
const port=Number(process.env.MOCK_MCP_PORT??4100);httpServer.listen(port,"0.0.0.0",()=>console.log(`[mock-mcp] CRM: http://localhost:${port}/crm/mcp\n[mock-mcp] Tickets: http://localhost:${port}/tickets/mcp\n[mock-mcp] Analytics: http://localhost:${port}/analytics/mcp`));

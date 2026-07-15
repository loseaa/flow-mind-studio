import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatConversation, ChatMessage } from "@flowmind/shared";
import { ChatMessageList } from "../ChatMessageList";
import { ChatPartList, registerChatPartRenderer } from "./PartRendererRegistry";

describe("Chat part renderer registry",()=>{
  it("renders an MCP approval card inside the assistant message and dispatches a typed action",()=>{const dispatch=vi.fn();const conversation:ChatConversation={id:"conv",organizationId:"org",title:"MCP test",model:"test",knowledgeBaseIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const message:ChatMessage={id:"msg",conversationId:"conv",role:"assistant",content:"准备执行工具",citations:[],createdAt:new Date().toISOString(),parts:[{id:"part",type:"tool_call",props:{invocationId:"inv",toolName:"update_customer_stage",riskLevel:"medium",status:"approval_required",input:{customerId:"cus_1"}}}]};render(<ChatMessageList conversation={conversation} messages={[message]} onPartAction={dispatch}/>);expect(screen.getByText("准备执行工具")).toBeInTheDocument();expect(screen.getByText("update_customer_stage")).toBeInTheDocument();screen.getByRole("button",{name:"确认执行"}).click();expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:"mcp.confirm",messageId:"msg"}));});
  it("allows future card types to register without changing the message list",()=>{const unregister=registerChatPartRenderer("future.chart",({part}:any)=><div>Chart: {part.data.title}</div>);render(<ChatPartList parts={[{id:"chart",type:"future.chart",data:{title:"Revenue"}} as any]} context={{messageId:"msg",dispatch:vi.fn()}} fallback={()=>null}/>);expect(screen.getByText("Chart: Revenue")).toBeInTheDocument();unregister();});
});

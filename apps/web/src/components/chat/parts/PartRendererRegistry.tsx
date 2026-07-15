import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Bot, Check, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import type { ChatPart } from "@flowmind/shared";
import { PartActionButton, PartActions, PartCard, PartCardHeader, PartJson, PartStatus } from "./CardPrimitives";

export type PartAction = {type:"mcp.confirm"|"mcp.reject";part:Extract<ChatPart,{type:"tool_call"}>;messageId:string};
export type PartRenderContext={messageId:string;isStreaming?:boolean;dispatch:(action:PartAction)=>void};
export type ChatPartRendererProps<T extends ChatPart=ChatPart>={part:T;context:PartRenderContext};
type Renderer=ComponentType<ChatPartRendererProps<any>>;
const renderers=new Map<string,Renderer>();
export function registerChatPartRenderer(type:ChatPart["type"]|string,renderer:Renderer){renderers.set(type,renderer);return()=>renderers.delete(type);}
export function getChatPartRenderer(type:string){return renderers.get(type)}
export function ChatPartList({parts,context,fallback}:{parts:ChatPart[];context:PartRenderContext;fallback:(part:ChatPart,context:PartRenderContext)=>ReactNode}){return <div className="mt-4 space-y-3">{parts.map(part=>{const Renderer=renderers.get(part.type);return Renderer?<Renderer key={part.id} part={part} context={context}/>:<span key={part.id}>{fallback(part,context)}</span>})}</div>}

function McpInvocationRenderer({part,context}:{part:Extract<ChatPart,{type:"tool_call"}>;context:PartRenderContext}){const {props}=part;const waiting=props.status==="approval_required",running=props.status==="started";const icon=waiting?<AlertTriangle size={16} className="text-amber-600"/>:running?<Loader2 size={16} className="animate-spin text-blue-600"/>:props.status==="completed"?<CheckCircle2 size={16} className="text-emerald-600"/>:props.status==="expired"?<Clock3 size={16} className="text-slate-500"/>:<Bot size={16}/>;return <PartCard tone={waiting?"warning":props.status==="failed"?"danger":props.status==="completed"?"success":"default"}><PartCardHeader icon={icon} title={props.toolName} subtitle={`MCP 工具调用 · ${riskLabel(props.riskLevel)}`} badge={<PartStatus tone={statusTone(props.status)}>{statusLabel(props.status)}</PartStatus>}/><div className="space-y-3 px-4 py-3"><PartJson label="调用参数" value={props.input}/>{props.output!==undefined?<PartJson label="执行结果" value={props.output} tone="success"/>:null}{props.message?<p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{props.message}</p>:null}</div>{waiting?<PartActions><PartActionButton tone="primary" onClick={()=>context.dispatch({type:"mcp.confirm",part,messageId:context.messageId})}><Check size={14}/>确认执行</PartActionButton><PartActionButton onClick={()=>context.dispatch({type:"mcp.reject",part,messageId:context.messageId})}><XCircle size={14}/>拒绝</PartActionButton></PartActions>:null}</PartCard>}
registerChatPartRenderer("tool_call",McpInvocationRenderer as Renderer);
function statusLabel(status:Extract<ChatPart,{type:"tool_call"}>["props"]["status"]){return({proposed:"已提议",approval_required:"等待确认",started:"执行中",completed:"已完成",failed:"失败",rejected:"已拒绝",expired:"已过期"})[status]}
function statusTone(status:Extract<ChatPart,{type:"tool_call"}>["props"]["status"]):"neutral"|"success"|"warning"|"danger"|"info"{if(status==="completed")return"success";if(status==="approval_required")return"warning";if(status==="failed"||status==="rejected")return"danger";if(status==="started")return"info";return"neutral"}
function riskLabel(risk:"low"|"medium"|"high"){return({low:"低风险",medium:"中风险",high:"高风险"})[risk]}

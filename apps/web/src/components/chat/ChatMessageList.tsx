import { useState } from "react";
import type { ReactNode } from "react";
import { Bot, Check, Copy, FileText, PencilLine, Quote, RotateCcw } from "lucide-react";
import type { ChatConversation, ChatMessage, ChatPart } from "@flowmind/shared";
import { Streamdown } from "streamdown";
import { createMathPlugin } from "@streamdown/math";
import "katex/dist/katex.min.css";

const streamdownPlugins = { math: createMathPlugin({ singleDollarTextMath: true }) };

export function ChatMessageList({
  conversation,
  messages,
  isStreaming,
  onEditUserMessage,
  onQuoteUserMessage,
  onResendUserMessage,
}: {
  conversation: ChatConversation;
  messages: ChatMessage[];
  isStreaming?: boolean;
  onEditUserMessage?: (content: string) => void;
  onQuoteUserMessage?: (content: string) => void;
  onResendUserMessage?: (content: string) => void;
}) {
  return (
    <section className="flex-1 space-y-7 pb-6">
      <div className="space-y-2 animate-fade-down">
        <h1 className="break-words text-2xl font-bold">{conversation.title}</h1>
        <p className="text-[13px] text-[#8a94a3]">
          使用 {conversation.model} · 已连接 FlowMindStudio 后端 ·{" "}
          {messages.length} 条消息
        </p>
      </div>

      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLast = index === messages.length - 1;
        return (
          <div
            key={message.id}
            className={`${isUser ? "flex justify-end" : "space-y-3"} animate-fade-up`}
            style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
          >
            {isUser ? (
              <UserMessage
                content={message.content}
                disableSendActions={isStreaming}
                onEdit={onEditUserMessage}
                onQuote={onQuoteUserMessage}
                onResend={onResendUserMessage}
              />
            ) : (
              <AssistantMessage message={message} isStreaming={isStreaming && isLast} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function UserMessage({
  content,
  disableSendActions,
  onEdit,
  onQuote,
  onResend,
}: {
  content: string;
  disableSendActions?: boolean;
  onEdit?: (content: string) => void;
  onQuote?: (content: string) => void;
  onResend?: (content: string) => void;
}) {
  return (
    <div className="group flex max-w-[620px] flex-col items-end gap-2">
      <div className="max-w-[560px] rounded-2xl rounded-br-md bg-gradient-to-br from-[#0f766e] to-[#115e59] px-5 py-3.5 text-sm leading-6 text-white shadow-[0_2px_12px_rgba(15,118,110,0.18)] transition-shadow duration-200 hover:shadow-[0_4px_18px_rgba(15,118,110,0.28)]">
        {content}
      </div>
      <UserMessageActions
        content={content}
        disableSendActions={disableSendActions}
        onEdit={onEdit}
        onQuote={onQuote}
        onResend={onResend}
      />
    </div>
  );
}

function UserMessageActions({
  content,
  disableSendActions,
  onEdit,
  onQuote,
  onResend,
}: {
  content: string;
  disableSendActions?: boolean;
  onEdit?: (content: string) => void;
  onQuote?: (content: string) => void;
  onResend?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await copyText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5 text-xs opacity-100 transition-opacity duration-200 sm:opacity-70 sm:group-hover:opacity-100">
      <MessageActionButton title="复制消息" onClick={() => void copyMessage()}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "已复制" : "复制"}
      </MessageActionButton>
      <MessageActionButton title="放回输入框编辑" onClick={() => onEdit?.(content)} disabled={!onEdit}>
        <PencilLine size={13} />
        编辑
      </MessageActionButton>
      <MessageActionButton title="引用这条消息继续追问" onClick={() => onQuote?.(content)} disabled={!onQuote}>
        <Quote size={13} />
        引用
      </MessageActionButton>
      <MessageActionButton
        title={disableSendActions ? "等待当前回复完成后再重新发送" : "重新发送这条消息"}
        onClick={() => onResend?.(content)}
        disabled={!onResend || disableSendActions}
      >
        <RotateCcw size={13} />
        重发
      </MessageActionButton>
    </div>
  );
}

function MessageActionButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-[#d9e1e8] bg-white/90 px-2.5 font-medium text-[#5b6472] shadow-sm transition hover:border-[#b9c4cf] hover:bg-[#f8fafb] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function AssistantMessage({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const hasRagAnswer = message.parts?.some((part) => part.type === "rag_answer") ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eef7f5] text-[#0f766e] transition-transform duration-200 hover:scale-110 ring-1 ring-[#b9d8d3]">
          <Bot size={17} />
        </span>
        FlowMind AI
      </div>
      <div className="max-w-[640px] rounded-2xl rounded-bl-md border border-[#d1e7e3] bg-white px-5 py-3.5 shadow-[0_2px_12px_rgba(15,118,110,0.07)]">
        {message.content && !hasRagAnswer ? (
          <Streamdown isAnimating={isStreaming} plugins={streamdownPlugins}>
            {message.content}
          </Streamdown>
        ) : null}
        {message.parts?.length ? <StructuredParts parts={message.parts} isStreaming={isStreaming} /> : null}
        {message.citations.length > 0 && !hasRagAnswer ? (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-[#eef2f5] pt-3">
            {message.citations.map((citation) => (
              <details
                key={citation.chunkId}
                className="rounded-lg border border-[#d9e1e8] bg-white px-3 py-2 text-xs text-[#5b6472] transition-shadow duration-200 hover:shadow-sm"
              >
                <summary className="cursor-pointer list-none">
                  <span className="font-semibold text-[#111827]">{citation.documentName}</span>
                  <span className="ml-2 font-mono">score {citation.score}</span>
                </summary>
                <p className="mt-2 max-w-[520px] border-t border-[#eef2f5] pt-2 leading-5">{citation.quote}</p>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StructuredParts({ parts, isStreaming }: { parts: ChatPart[]; isStreaming?: boolean }) {
  return (
    <div className="mt-4 space-y-3">
      {parts.map((part) => {
        if (part.type === "rag_answer") return <RagAnswerPart key={part.id} part={part} isStreaming={isStreaming} />;
        if (part.type === "card") return <CardPart key={part.id} part={part} />;
        if (part.type === "table") return <TablePart key={part.id} part={part} />;
        if (part.type === "text") return <TextPart key={part.id} part={part} />;
        if (part.type === "placeholder") return <StructuredPartSkeleton key={part.id} />;
        return null;
      })}
    </div>
  );
}

function RagAnswerPart({ part, isStreaming }: { part: Extract<ChatPart, { type: "rag_answer" }>; isStreaming?: boolean }) {
  const { answer, sources } = part.props;

  return (
    <section className="overflow-hidden rounded-xl border border-[#b9d8d3] bg-[#f7fbfa]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8ebe7] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f3f3a]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#0f766e] ring-1 ring-[#d8ebe7]">
            <FileText size={15} />
          </span>
          基于知识库回答
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#0f766e] ring-1 ring-[#d8ebe7]">
          {sources.length} 条出处
        </span>
      </div>

      <div className="px-4 py-3 text-sm leading-6 text-[#111827]">
        {answer ? (
          <Streamdown isAnimating={isStreaming} plugins={streamdownPlugins}>{answer}</Streamdown>
        ) : (
          <div className="space-y-2 py-1">
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-[#d8ebe7]" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#e7f2ef]" />
          </div>
        )}
      </div>

      <div className="border-t border-[#d8ebe7] bg-white/65 px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7785]">Sources</div>
        <div className="space-y-2">
          {sources.map((source, index) => (
            <details key={source.chunkId} className="rounded-lg border border-[#d9e1e8] bg-white px-3 py-2 text-xs text-[#5b6472] transition-shadow duration-200 hover:shadow-sm">
              <summary className="cursor-pointer list-none">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#eef7f5] font-mono text-[11px] font-semibold text-[#0f766e]">
                  {index + 1}
                </span>
                <span className="font-semibold text-[#111827]">{source.documentName}</span>
                <span className="ml-2 font-mono text-[#6b7785]">score {formatScore(source.score)}</span>
              </summary>
              <p className="mt-2 max-w-[540px] border-t border-[#eef2f5] pt-2 leading-5">{source.quote}</p>
              <p className="mt-1 font-mono text-[11px] text-[#8a94a3]">chunk {source.chunkId}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function StructuredPartSkeleton() {
  return (
    <section className="min-h-[178px] rounded-xl border border-[#d9e1e8] bg-[#fbfcfd] p-4">
      <div className="h-4 w-40 animate-pulse rounded-full bg-[#d9e1e8]" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-[#eef2f5]" />
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-[#eef2f5]" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-lg border border-[#eef2f5] bg-white/80 px-3 py-2">
            <div className="h-2.5 w-16 animate-pulse rounded-full bg-[#e5ebf0]" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-[#d9e1e8]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function TextPart({ part }: { part: Extract<ChatPart, { type: "text" }> }) {
  return (
    <div className="text-sm leading-6 text-[#111827]">
      <Streamdown plugins={streamdownPlugins}>{part.text}</Streamdown>
    </div>
  );
}

type CardTone = NonNullable<Extract<ChatPart, { type: "card" }>["props"]["tone"]>;

const toneStyles: Record<CardTone, string> = {
  default: "border-[#d9e1e8] bg-[#fbfcfd]",
  success: "border-[#b7e4d2] bg-[#f0fdf8]",
  warning: "border-[#f5d08a] bg-[#fffbeb]",
  danger: "border-[#fecaca] bg-[#fff1f2]",
};

function CardPart({ part }: { part: Extract<ChatPart, { type: "card" }> }) {
  const { title, description, tone = "default", meta = [] } = part.props;

  return (
    <section className={`rounded-xl border p-4 ${toneStyles[tone]}`}>
      <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
      {description ? <p className="mt-1 text-sm leading-6 text-[#5b6472]">{description}</p> : null}
      {meta.length ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {meta.map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
              <dt className="text-xs text-[#8a94a3]">{item.label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-[#111827]">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

const alignClasses: Record<NonNullable<Extract<ChatPart, { type: "table" }>["props"]["columns"][number]["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function TablePart({ part }: { part: Extract<ChatPart, { type: "table" }> }) {
  const { caption, columns, rows } = part.props;

  return (
    <section className="overflow-hidden rounded-xl border border-[#d9e1e8] bg-white">
      {caption ? <div className="border-b border-[#eef2f5] px-4 py-3 text-sm font-semibold text-[#111827]">{caption}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#f8fafb]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-4 py-2.5 font-semibold text-[#5b6472] ${alignClasses[column.align ?? "left"]}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[#eef2f5]">
                {columns.map((column) => (
                  <td key={column.key} className={`max-w-[220px] break-words px-4 py-2.5 text-[#111827] ${alignClasses[column.align ?? "left"]}`}>
                    {formatCellValue(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCellValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function formatScore(score: number) {
  return Number.isFinite(score) ? score.toFixed(3) : "-";
}

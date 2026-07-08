import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, FileJson, Send, Sparkles, User } from "lucide-react";
import type { DesignDocument } from "@flowmind/shared";
import { API_BASE_URL, apiPostStrict } from "../../api";
import {
  AgentWebSocketSession,
  type AgentProgressEvent,
  type AgentResponse,
  type AgentStatus,
  type ClarificationQuestion,
} from "./agentWebSocketSession";


type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type LowCodeAgentChatProps = {
  onApplyDocument: (document: DesignDocument) => void;
};

const text = {
  title: "AI \u5bf9\u8bdd",
  subtitle: "\u548c design agent \u5bf9\u8bdd\uff0c\u6536\u655b\u4e3a\u753b\u5e03 JSON",
  placeholder: "\u4f8b\u5982\uff1a\u505a\u4e00\u4e2a\u9002\u5408\u4e2d\u5e74\u7528\u6237\u7684\u7535\u5546\u9996\u9875",
  send: "\u53d1\u9001",
  continue: "\u7ee7\u7eed",
  generating: "Agent \u6267\u884c\u4e2d...",
  clarification: "\u9700\u8981\u786e\u8ba4\u610f\u56fe",
  completed: "\u5df2\u751f\u6210\u8bbe\u8ba1 JSON \u5e76\u653e\u5230\u753b\u5e03",
  failed: "Agent \u6267\u884c\u5931\u8d25",
  freeText: "\u8f93\u5165\u4f60\u7684\u56de\u7b54",
  artifact: "\u4e2d\u95f4\u4ea7\u7269",
  image: "\u56fe\u7247",
  progress: "\u5b9e\u65f6\u8fdb\u5ea6",
  planned: "\u89c4\u5212",
  generated: "\u5df2\u751f\u6210",
  minimum: "\u6700\u4f4e",
  backgroundImage: "\u80cc\u666f\u56fe",
  contentImage: "\u5185\u5bb9\u56fe",
  attempts: "\u5c1d\u8bd5",
};

export function LowCodeAgentChat({ onApplyDocument }: LowCodeAgentChatProps) {
  const sessionRef = useRef<AgentWebSocketSession>();
  if (!sessionRef.current) sessionRef.current = new AgentWebSocketSession(createAgentWsUrl());
  useEffect(() => () => sessionRef.current?.close(), []);
  const [runId, setRunId] = useState<string>();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AgentStatus | "idle">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "\u8bf7\u63cf\u8ff0\u4f60\u60f3\u751f\u6210\u7684\u9875\u9762\u3002\u6211\u4f1a\u5148\u7406\u89e3\u610f\u56fe\uff0c\u4fe1\u606f\u4e0d\u8db3\u65f6\u9010\u4e2a\u53cd\u95ee\uff0c\u6700\u540e\u751f\u6210\u753b\u5e03 JSON\u3002" }
  ]);
  const [response, setResponse] = useState<AgentResponse>();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [progressEvents, setProgressEvents] = useState<AgentProgressEvent[]>([]);
  const latestProgressNode = [...progressEvents].reverse().find((event) => event.node)?.node;

  const questions = response?.clarification?.questions ?? [];
  const currentQuestion = questions[questionIndex];
  const canSubmitInitial = input.trim().length > 0 && status !== "running";
  const currentAnswer = useMemo(() => {
    if (!currentQuestion) return "";
    if (currentQuestion.expectedAnswerShape === "free_text" || !currentQuestion.options?.length) return freeText.trim();
    return selectedOptions.join("\uff0c");
  }, [currentQuestion, freeText, selectedOptions]);

  async function sendInitialMessage() {
    if (!canSubmitInitial) return;
    const content = input.trim();
    setInput("");
    setMessages((current) => [...current, { id: createMessageId(), role: "user", content }]);
    await callAgent({ message: content });
  }

  async function submitClarificationAnswer() {
    if (!currentQuestion || !currentAnswer) return;
    const answerLine = `${currentQuestion.question}\n${currentAnswer}`;
    const nextAnswers = [...answers, answerLine];
    setMessages((current) => [...current, { id: createMessageId(), role: "user", content: currentAnswer }]);

    if (questionIndex < questions.length - 1) {
      setAnswers(nextAnswers);
      setQuestionIndex((current) => current + 1);
      resetQuestionInput();
      return;
    }

    await callAgent({ runId, answer: nextAnswers.join("\n\n") });
    setAnswers([]);
    setQuestionIndex(0);
    resetQuestionInput();
  }

  async function callAgent(body: { message?: string; answer?: string; runId?: string }) {
    setStatus("running");
    setError(undefined);
    setProgressEvents([]);
    try {
      const result = await callAgentOverWebSocket(sessionRef.current!, body, {
        onProgress: (event) => {
          setProgressEvents((current) => [...current, event].slice(-12));
          if (event.node) {
            setResponse((current) => current ? { ...current, currentNode: event.node ?? current.currentNode } : current);
          }
        },
        onRunStarted: (startedRunId) => setRunId(startedRunId)
      });
      setRunId(result.runId);
      setResponse(result);
      setStatus(result.status);
      if (result.status === "needs_input") {
        setMessages((current) => [...current, { id: createMessageId(), role: "assistant", content: result.clarification?.reason ?? text.clarification }]);
      } else if (result.status === "completed" && result.document) {
        onApplyDocument(result.document);
        setMessages((current) => [...current, { id: createMessageId(), role: "assistant", content: text.completed }]);
      } else if (result.status === "failed") {
        setMessages((current) => [...current, { id: createMessageId(), role: "assistant", content: text.failed }]);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : text.failed;
      setStatus("failed");
      setError(message);
      setMessages((current) => [...current, { id: createMessageId(), role: "assistant", content: message }]);
    }
  }

  function resetQuestionInput() {
    setFreeText("");
    setSelectedOptions([]);
  }

  function toggleOption(option: string) {
    if (!currentQuestion) return;
    if (currentQuestion.expectedAnswerShape === "single_choice") {
      setSelectedOptions([option]);
      return;
    }
    setSelectedOptions((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  }

  return (
    <aside className="relative z-40 flex h-full min-h-0 flex-col border-r border-[#d9e1e8] bg-white max-lg:hidden">
      <div className="border-b border-[#e4e9ee] p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#e6f4f1] text-[#0f766e]"><Sparkles size={16} /></span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#101828]">{text.title}</div>
            <div className="mt-0.5 text-[11px] text-[#8a94a3]">{text.subtitle}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        <StatusStrip status={status} currentNode={latestProgressNode ?? response?.currentNode} />
        {progressEvents.length ? <ProgressList events={progressEvents} /> : null}
        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
        {status === "needs_input" && currentQuestion ? (
          <QuestionBox
            currentAnswer={currentAnswer}
            freeText={freeText}
            onFreeTextChange={setFreeText}
            onSubmit={submitClarificationAnswer}
            onToggleOption={toggleOption}
            question={currentQuestion}
            questionIndex={questionIndex}
            questionTotal={questions.length}
            selectedOptions={selectedOptions}
          />
        ) : null}
        {response?.imagePlanning || response?.imageGenerationSummary || response?.imageGeneration?.length ? (
          <div className="rounded-md border border-[#d9e1e8] bg-[#f8fafb] p-3 text-xs text-[#475467]">
            <div className="mb-2 flex items-center justify-between gap-2 font-bold text-[#101828]">
              <span className="flex items-center gap-1.5"><FileJson size={14} />{text.image}</span>
              {response.imageGenerationSummary ? (
                <span className="text-[11px] text-[#0f766e]">{text.generated} {response.imageGenerationSummary.generatedCount}/{response.imageGenerationSummary.plannedCount}</span>
              ) : null}
            </div>
            {response.imagePlanning ? (
              <div className="mb-2 text-[11px] text-[#667085]">
                {text.planned} {response.imagePlanning.plannedCount} / {text.minimum} {response.imagePlanning.minimumGeneratedAssets}
              </div>
            ) : null}
            {response.imageGeneration?.length ? (
              <div className="space-y-1">
                {response.imageGeneration.map((item) => {
                  const kindLabel = item.kind === "background_image" ? text.backgroundImage : text.contentImage;
                  return (
                    <div key={item.assetId} className="flex justify-between gap-2">
                      <span className="truncate">{kindLabel} / {item.assetId}</span>
                      <span className="shrink-0">{item.status} / {item.width}x{item.height} / {text.attempts}{item.attempts}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {response?.artifacts?.length ? (
          <div className="rounded-md border border-[#d9e1e8] bg-white p-3 text-xs text-[#475467]">
            <div className="mb-2 font-bold text-[#101828]">{text.artifact}</div>
            <div className="space-y-1">
              {response.artifacts.slice(-6).map((artifact) => (
                <div key={artifact.node} className="flex justify-between gap-2">
                  <span className="truncate">{artifact.node}</span>
                  <span>v{artifact.version}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {error ? <div className="rounded-md border border-[#fecdca] bg-[#fff1f2] p-3 text-xs text-[#b42318]">{error}</div> : null}
      </div>

      <div className="border-t border-[#e4e9ee] p-3.5">
        <div className="flex gap-2">
          <textarea
            className="min-h-[72px] flex-1 resize-none rounded-md border border-[#d9e1e8] bg-white px-3 py-2 text-sm text-[#101828] outline-none focus:border-[#0f766e]"
            disabled={status === "running" || status === "needs_input"}
            placeholder={text.placeholder}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void sendInitialMessage();
            }}
          />
          <button
            type="button"
            className="grid h-[72px] w-10 place-items-center rounded-md bg-[#0f766e] text-white disabled:cursor-not-allowed disabled:bg-[#b9c4cf]"
            disabled={!canSubmitInitial}
            title={text.send}
            onClick={() => void sendInitialMessage()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatusStrip({ currentNode, status }: { currentNode?: string; status: AgentStatus | "idle" }) {
  const icon = status === "completed" ? <CheckCircle2 size={14} /> : status === "failed" ? <AlertCircle size={14} /> : <Bot size={14} />;
  return (
    <div className="flex items-center justify-between rounded-md bg-[#eef2f5] px-2.5 py-2 text-xs font-semibold text-[#475467]">
      <span className="flex items-center gap-1.5">{icon}{status === "running" ? text.generating : status}</span>
      <span className="max-w-[128px] truncate text-[#667085]">{currentNode ?? "idle"}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded bg-[#e6f4f1] text-[#0f766e]"><Bot size={13} /></span> : null}
      <div className={`max-w-[210px] whitespace-pre-wrap rounded-md px-3 py-2 text-xs leading-5 ${isUser ? "bg-[#0f766e] text-white" : "bg-[#f8fafb] text-[#344054]"}`}>{message.content}</div>
      {isUser ? <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded bg-[#eef2f5] text-[#475467]"><User size={13} /></span> : null}
    </div>
  );
}

function QuestionBox({
  currentAnswer,
  freeText,
  onFreeTextChange,
  onSubmit,
  onToggleOption,
  question,
  questionIndex,
  questionTotal,
  selectedOptions,
}: {
  currentAnswer: string;
  freeText: string;
  onFreeTextChange: (value: string) => void;
  onSubmit: () => void;
  onToggleOption: (option: string) => void;
  question: ClarificationQuestion;
  questionIndex: number;
  questionTotal: number;
  selectedOptions: string[];
}) {
  const hasOptions = Boolean(question.options?.length);
  return (
    <div className="rounded-md border-2 border-[#0f766e] bg-[#f0faf8] p-3 shadow-sm">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-[#0f766e]">{text.clarification} {questionIndex + 1}/{questionTotal}</div>
      <div className="text-sm font-bold leading-5 text-[#101828]">{question.question}</div>
      <div className="mt-3 space-y-2">
        {hasOptions ? question.options!.map((option) => {
          const active = selectedOptions.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`w-full rounded-md border px-3 py-2 text-left text-xs font-semibold ${active ? "border-[#0f766e] bg-white text-[#0f766e]" : "border-[#d9e1e8] bg-white/70 text-[#344054] hover:bg-white"}`}
              onClick={() => onToggleOption(option)}
            >
              {option}
            </button>
          );
        }) : (
          <textarea
            className="min-h-[78px] w-full resize-none rounded-md border border-[#b9c4cf] bg-white px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
            placeholder={text.freeText}
            value={freeText}
            onChange={(event) => onFreeTextChange(event.target.value)}
          />
        )}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-md bg-[#0f766e] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b9c4cf]"
        disabled={!currentAnswer}
        onClick={onSubmit}
      >
        {text.continue}
      </button>
    </div>
  );
}
function ProgressList({ events }: { events: AgentProgressEvent[] }) {
  return (
    <div className="rounded-md border border-[#d9e1e8] bg-[#f8fafb] p-3 text-xs text-[#475467]">
      <div className="mb-2 font-bold text-[#101828]">{text.progress}</div>
      <div className="space-y-1.5">
        {events.map((event, index) => (
          <div key={`${event.raw}-${index}`} className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.kind === "error" ? "bg-[#f04438]" : event.kind === "node" ? "bg-[#0f766e]" : "bg-[#98a2b3]"}`} />
            <span className="min-w-0 flex-1 truncate">{event.node ? `${event.node} - ${event.label ?? event.message}` : event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function callAgentOverWebSocket(
  session: AgentWebSocketSession,
  body: { message?: string; answer?: string; runId?: string },
  callbacks: { onProgress: (event: AgentProgressEvent) => void; onRunStarted: (runId: string) => void }
): Promise<AgentResponse> {
  return session.request(body, callbacks).catch(async (error) => {
    if (error instanceof Error && error.message.includes("WebSocket")) {
      return apiPostStrict<AgentResponse>("/low-code/agent/messages", body);
    }
    throw error;
  });
}

function createAgentWsUrl() {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/low-code/agent/ws";
  url.search = "";
  return url.toString();
}

function createMessageId() {
  return `agent_message_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
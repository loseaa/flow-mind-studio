import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Menu,
  MessageSquarePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { StickToBottom, type StickToBottomContext } from "use-stick-to-bottom";
import type {
  ChatConversation,
  ChatMessage,
  ChatStreamEvent,
  KnowledgeBase,
} from "@flowmind/shared";
import {
  apiCreate,
  apiDelete,
  apiGet,
  apiPatch,
  fallbackKnowledgeBases,
  streamChatMessage,
} from "../../api";
import { ChatComposer } from "../../components/chat/ChatComposer";
import { ChatMessageList } from "../../components/chat/ChatMessageList";
import { ChatWelcome } from "../../components/chat/ChatWelcome";
import { QuickPromptGrid } from "../../components/chat/QuickPromptGrid";
import { quickPrompts } from "../../components/chat/chatData";
import {
  CustomScrollbar,
  ScrollbarTrack,
} from "../../components/CustomScrollbar";

export function ChatPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(fallbackKnowledgeBases);
  const stickContextRef = useRef<StickToBottomContext | null>(null);

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedId) ??
      null,
    [conversations, selectedId],
  );

  useEffect(() => {
    void loadConversations();
    void apiGet("/knowledge/bases", fallbackKnowledgeBases).then(setKnowledgeBases);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
  }, [selectedId]);

  async function loadConversations() {
    setIsLoading(true);
    setError(null);
    try {
      const items = await apiGet<ChatConversation[]>("/chat/conversations", []);
      if (items.length === 0) {
        const created = await apiCreate<ChatConversation>(
          "/chat/conversations",
        );
        setConversations([created]);
        setSelectedId(created.id);
      } else {
        setConversations(items);
        setSelectedId((current) => current ?? items[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "加载会话失败。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setError(null);
    try {
      const items = await apiGet<ChatMessage[]>(
        `/chat/conversations/${conversationId}/messages`,
        [],
      );
      setMessages(items);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "加载消息失败。",
      );
    }
  }

  async function createConversation() {
    setError(null);
    const created = await apiCreate<ChatConversation>("/chat/conversations");
    setConversations((current) => [created, ...current]);
    setSelectedId(created.id);
    setMessages([]);
    setSidebarOpen(false);
  }

  async function renameConversation(conversationId: string) {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title) return;

    try {
      const updated = await apiPatch<ChatConversation>(
        `/chat/conversations/${conversationId}`,
        { title },
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id ? updated : conversation,
        ),
      );
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : "重命名失败。",
      );
    }
  }

  async function deleteConversation(conversationId: string) {
    const confirmed = window.confirm("删除这个聊天记录？");
    if (!confirmed) return;

    await apiDelete(`/chat/conversations/${conversationId}`);
    const next = conversations.filter(
      (conversation) => conversation.id !== conversationId,
    );
    setConversations(next);
    if (selectedId === conversationId) {
      setMessages([]);
      setSelectedId(next[0]?.id ?? null);
      if (next.length === 0) void createConversation();
    }
  }

  async function toggleKnowledgeBase(knowledgeBaseId: string) {
    if (!selectedConversation) return;
    const nextIds = selectedConversation.knowledgeBaseIds.includes(knowledgeBaseId)
      ? selectedConversation.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId)
      : [...selectedConversation.knowledgeBaseIds, knowledgeBaseId];
    try {
      const updated = await apiPatch<ChatConversation>(`/chat/conversations/${selectedConversation.id}/knowledge-bases`, { knowledgeBaseIds: nextIds });
      setConversations((current) => current.map((conversation) => conversation.id === updated.id ? updated : conversation));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新知识库范围失败。");
    }
  }

  async function send(content = input) {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const conversation =
        selectedConversation ??
        (await apiCreate<ChatConversation>("/chat/conversations"));
      if (!selectedConversation) {
        setConversations((current) => [conversation, ...current]);
        setSelectedId(conversation.id);
      }

      if (messages.length === 0 && conversation.title === "新对话") {
        setConversations((current) =>
          current.map((item) =>
            item.id === conversation.id
              ? {
                  ...item,
                  title: createLocalTitle(trimmed),
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
      }

      const localUserId = `local_user_${Date.now()}`;
      const localAssistantId = `local_assistant_${Date.now()}`;
      const localUserMessage: ChatMessage = {
        id: localUserId,
        conversationId: conversation.id,
        role: "user",
        content: trimmed,
        parts: [],
        citations: [],
        createdAt: new Date().toISOString(),
      };
      const localAssistantMessage: ChatMessage = {
        id: localAssistantId,
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        parts: [],
        citations: [],
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [
        ...current,
        localUserMessage,
        localAssistantMessage,
      ]);

      await streamChatMessage(conversation.id, trimmed, (event) => {
        applyStreamEvent(event, localUserId, localAssistantId);
      });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "发送失败，请检查 API 与 Ollama 服务。",
      );
    } finally {
      setIsSending(false);
    }
  }

  function applyStreamEvent(
    event: ChatStreamEvent,
    localUserId: string,
    localAssistantId: string,
  ) {
    if (event.type === "message.created") {
      setMessages((current) =>
        current.map((message) =>
          message.id === localUserId ? event.payload.message : message,
        ),
      );
      return;
    }

    if (event.type === "chat.token") {
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantId
            ? { ...message, content: message.content + event.payload.token }
            : message,
        ),
      );
      return;
    }

    if (event.type === "chat.done") {
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantId
            ? { ...event.payload.message, id: message.id }
            : message,
        ),
      );
      return;
    }

    if (event.type === "chat.part.placeholder") {
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantId
            ? {
                ...message,
                parts: [...(message.parts ?? []), event.payload.part],
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "chat.part") {
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantId
            ? {
                ...message,
                parts: replacePart(message.parts ?? [], event.payload.part),
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "chat.error") {
      setError(event.payload.message);
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantId
            ? { ...message, content: `生成失败：${event.payload.message}` }
            : message,
        ),
      );
    }
  }

  const isEmptyState = messages.length === 0;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#f8fafb]">
      <div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[300px_1fr]">
        <ConversationSidebar
          conversations={conversations}
          selectedId={selectedId}
          isOpen={sidebarOpen}
          editingId={editingId}
          draftTitle={draftTitle}
          onClose={() => setSidebarOpen(false)}
          onCreate={() => void createConversation()}
          onSelect={(id) => {
            setSelectedId(id);
            setSidebarOpen(false);
          }}
          onStartEdit={(conversation) => {
            setEditingId(conversation.id);
            setDraftTitle(conversation.title);
          }}
          onDraftTitle={setDraftTitle}
          onRename={(id) => void renameConversation(id)}
          onDelete={(id) => void deleteConversation(id)}
        />

        <main className="min-w-0">
          <div className="mx-auto flex h-[calc(100vh-72px)] max-w-[900px] flex-col px-5 py-8">
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d9e1e8] bg-white px-3 text-sm font-semibold text-[#111827] transition-all duration-200 hover:bg-[#f6f8fa] hover:shadow-sm active:scale-95"
              >
                <Menu size={16} />
                聊天记录
              </button>
              <span className="text-xs font-medium text-[#8a94a3]">
                {selectedConversation?.model ?? "deepseek-v4-flash"}
              </span>
            </div>

            <div className="relative min-h-0 flex-1">
              <StickToBottom
                contextRef={stickContextRef}
                className="h-full pr-2"
                initial="instant"
                resize="instant"
              >
                {(context) => (
                  <>
                    <StickToBottom.Content
                      className="min-h-full pb-4"
                      scrollClassName="custom-scrollbar-container"
                    >
                      {error ? (
                        <div className="mb-4 animate-fade-down rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {error}
                        </div>
                      ) : null}
                      {isLoading ? (
                        <div className="flex min-h-[420px] items-center justify-center">
                          <span className="inline-flex items-center gap-2 text-sm text-[#8a94a3]">
                            <span className="h-2 w-2 rounded-full bg-[#0f766e] animate-pulse-soft" />
                            <span className="h-2 w-2 rounded-full bg-[#0f766e] animate-pulse-soft animate-delay-150" />
                            <span className="h-2 w-2 rounded-full bg-[#0f766e] animate-pulse-soft animate-delay-300" />
                          </span>
                        </div>
                      ) : !selectedConversation ? (
                        <div className="flex min-h-[420px] items-center justify-center text-sm text-[#8a94a3]">
                          暂无可用会话，请检查后端连接或新建对话。
                        </div>
                      ) : isEmptyState ? (
                        <div className="flex min-h-[420px] flex-col justify-center">
                          <ChatWelcome />
                        </div>
                      ) : (
                        <ChatMessageList
                          conversation={selectedConversation}
                          messages={messages}
                          isStreaming={isSending}
                          onEditUserMessage={setInput}
                          onQuoteUserMessage={(content) =>
                            setInput(`基于这条消息继续追问：\n\n> ${content.replace(/\n/g, "\n> ")}\n\n`)
                          }
                          onResendUserMessage={(content) => void send(content)}
                        />
                      )}
                    </StickToBottom.Content>
                    {!context.isAtBottom ? (
                      <button
                        onClick={() =>
                          void context.scrollToBottom({
                            animation: {
                              damping: 0.82,
                              stiffness: 0.08,
                              mass: 1.05,
                            },
                          })
                        }
                        className="absolute bottom-3 left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-[#d9e1e8] bg-white px-3 text-xs font-semibold text-[#111827] shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#b9c4cf] animate-fade-up"
                      >
                        <ArrowDown size={14} className="animate-bounce" />
                        回到底部
                      </button>
                    ) : null}
                  </>
                )}
              </StickToBottom>
              <ScrollbarTrack
                variant="teal"
                getScrollElement={() =>
                  stickContextRef.current?.scrollRef.current ?? null
                }
              />
            </div>

            <section className="shrink-0 space-y-5 pt-5">
              {isEmptyState && !isLoading ? (
                <QuickPromptGrid
                  prompts={quickPrompts}
                  onPick={(prompt) => void send(prompt)}
                />
              ) : null}
              <ChatComposer
                input={input}
                disabled={isSending || isLoading}
                modelLabel={selectedConversation?.model ?? "deepseek-v4-flash"}
                knowledgeBases={knowledgeBases}
                selectedKnowledgeBaseIds={selectedConversation?.knowledgeBaseIds ?? []}
                onChange={setInput}
                onSend={() => void send()}
                onToggleKnowledgeBase={(knowledgeBaseId) => void toggleKnowledgeBase(knowledgeBaseId)}
              />
              <p className="text-center text-xs text-[#8a94a3]">
                {selectedConversation?.knowledgeBaseIds.length
                  ? "已启用知识库约束：找不到支撑资料时将明确提示无依据。"
                  : "未选择知识库，当前为普通聊天模式。AI 可能会出错。"}
              </p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function replacePart(parts: ChatMessage["parts"], nextPart: ChatMessage["parts"][number]) {
  const index = parts.findIndex((part) => part.id === nextPart.id);
  if (index === -1) return [...parts, nextPart];
  return parts.map((part, currentIndex) => (currentIndex === index ? nextPart : part));
}

function ConversationSidebar({
  conversations,
  selectedId,
  isOpen,
  editingId,
  draftTitle,
  onClose,
  onCreate,
  onSelect,
  onStartEdit,
  onDraftTitle,
  onRename,
  onDelete,
}: {
  conversations: ChatConversation[];
  selectedId: string | null;
  isOpen: boolean;
  editingId: string | null;
  draftTitle: string;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onStartEdit: (conversation: ChatConversation) => void;
  onDraftTitle: (title: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[300px] flex-col border-r border-[#d9e1e8] bg-white transition-transform duration-300 ease-out lg:sticky lg:top-[72px] lg:z-0 lg:h-[calc(100vh-72px)] ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-[#d9e1e8] px-4">
          <div>
            <h2 className="text-sm font-bold text-[#111827]">聊天记录</h2>
            <p className="mt-0.5 text-xs text-[#8a94a3]">Postgres 持久化保存</p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg transition-colors duration-200 hover:bg-[#f4f7fa] lg:hidden"
            onClick={onClose}
            aria-label="关闭聊天记录"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={onCreate}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1e293b] text-sm font-bold text-white transition-all duration-200 hover:bg-[#111827] hover:shadow-md active:scale-[0.98]"
          >
            <MessageSquarePlus size={16} />
            新建对话
          </button>
        </div>

        <CustomScrollbar className="min-h-0 flex-1" variant="teal">
          <div className="space-y-2 px-3 pb-4">
            {conversations.map((conversation, index) => {
              const isActive = conversation.id === selectedId;
              const isEditing = conversation.id === editingId;
              return (
                <div
                  key={conversation.id}
                  className={`group rounded-lg border px-3 py-3 transition-all duration-200 animate-fade-up ${
                    isActive
                      ? "border-[#b9d8d3] bg-[#e8f4f2]"
                      : "border-transparent bg-white hover:border-[#d9e1e8] hover:bg-[#f8fafb]"
                  }`}
                  style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={(event) => onDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") onRename(conversation.id);
                          if (event.key === "Escape")
                            onDraftTitle(conversation.title);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-[#b9c4cf] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#0f766e]"
                      />
                      <button
                        className="grid h-8 w-8 place-items-center rounded-md hover:bg-white"
                        onClick={() => onRename(conversation.id)}
                        aria-label="保存标题"
                      >
                        <Check size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelect(conversation.id)}
                      className="block w-full text-left"
                    >
                      <div className="line-clamp-2 break-words text-sm font-semibold text-[#111827]">
                        {conversation.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#8a94a3]">
                        {conversation.model}
                      </div>
                    </button>
                  )}
                  {!isEditing ? (
                    <div className="mt-2 flex items-center gap-1 opacity-100 lg:opacity-0 lg:transition lg:group-hover:opacity-100">
                      <button
                        onClick={() => onStartEdit(conversation)}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#5b6472] hover:bg-white hover:text-[#111827]"
                        aria-label="重命名"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(conversation.id)}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#5b6472] hover:bg-white hover:text-red-600"
                        aria-label="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CustomScrollbar>
      </aside>
      {isOpen ? (
        <button
          aria-label="关闭聊天记录遮罩"
          onClick={onClose}
          className="fixed inset-0 z-30 animate-fade-in bg-black/20 lg:hidden"
        />
      ) : null}
    </>
  );
}

function createLocalTitle(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 24
    ? `${compact.slice(0, 24)}...`
    : compact || "新对话";
}

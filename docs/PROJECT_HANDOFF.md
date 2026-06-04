# FlowMindStudio 项目交接文档

本文档面向后续接手本项目的 agent 或工程师，目标是让读者能快速理解当前系统状态、真实可用链路、主要代码入口、运行方式和后续开发边界。

最后更新：2026-05-22

## 1. 项目定位

FlowMindStudio 是一个 TypeScript monorepo，当前定位是 SaaS AI 工作台 MVP。前端提供工作台界面，后端提供 REST 与 SSE API。当前最完整、真实接入的业务链路是 AI 对话：

- 前端 React 页面消费后端 SSE 流。
- 后端 NestJS 调用 OpenAI-compatible 大模型接口。
- 大模型当前配置为 DeepSeek 接口，模型默认 `deepseek-v4-flash`。
- 聊天会话与消息已持久化到 Postgres。
- 左侧会话列表支持新建、选择、重命名、软删除。
- AI assistant 消息支持受控结构化组件 `card` 和 `table`，通过 `parts` 协议保存和渲染。

其他模块，如知识库、MCP、低代码、数据模型、仪表盘，仍主要基于内存 `mockStore` 演示数据。

## 2. 仓库结构

```text
FlowMindStudio/
  apps/
    api/                  NestJS 后端 API
    web/                  React + Vite + Tailwind 前端
  packages/
    shared/               前后端共享类型、Zod schema、权限定义
    ui/                   共享 UI primitives
  infra/
    postgres/init.sql     Docker Postgres 初始化脚本，目前只启用 vector 扩展
  scripts/
    dev.mjs               同时启动 API 与 Web
    stop-dev.mjs          按端口停止本地开发进程
  docker-compose.yml      Postgres、Redis、API、Web 的 compose 定义
  .env.example            环境变量模板
  .env                    本地真实环境变量。包含密钥，不要打印、提交或写入文档
```

pnpm workspace 定义在 `pnpm-workspace.yaml`：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## 3. 技术栈

### 前端

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- React Router
- lucide-react 图标
- `use-stick-to-bottom`：AI 聊天滚动跟随与用户上滑取消跟随
- Vitest + Testing Library

### 后端

- NestJS 10
- TypeScript / CommonJS
- `@nestjs/config`
- `pg`
- RxJS SSE
- Vitest
- 已引入但多数未深度使用：BullMQ、Redis、LangChain、LangGraph

### 数据

- Postgres：当前聊天会话与消息真实持久化
- Redis：docker compose 已定义，但当前主要业务链路未强依赖
- pgvector：Docker 初始化脚本会启用 `vector` 扩展，为后续 RAG 准备

## 4. 本地运行

推荐在项目根目录执行：

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
corepack pnpm dev
```

或者分别启动：

```bash
corepack pnpm --filter @flowmind/api dev
corepack pnpm --filter @flowmind/web dev
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- API 全局前缀：`/api`
- 聊天页：`http://localhost:5173/app/chat`

停止本地开发进程：

```bash
corepack pnpm dev:stop
```

`scripts/dev.mjs` 会同时启动 API 和 Web。Windows 下会通过 `cmd.exe` 调用 `corepack pnpm ...`。

## 5. 环境变量

模板见 `.env.example`。真实 `.env` 已存在于本地，但包含 DeepSeek API key，不能泄露。

关键变量：

```dotenv
NODE_ENV=development
API_PORT=4000
WEB_PORT=5173

DATABASE_URL=postgresql://postgres:root@localhost:5432/flowmind
REDIS_URL=redis://localhost:6379

LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=<不要写入文档或提交>
LLM_MODEL=deepseek-v4-flash

DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=<不要写入文档或提交>
DEEPSEEK_MODEL=deepseek-v4-flash

OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

后端 `ConfigModule` 配置在 `apps/api/src/app.module.ts`：

```ts
ConfigModule.forRoot({ envFilePath: [".env", "../../.env"], isGlobal: true })
```

这意味着：

- 从项目根目录启动时读取根目录 `.env`。
- 从 `apps/api` 目录启动时也能通过 `../../.env` 找到根目录 `.env`。

当前用户本机 Postgres 信息：

- 用户：`postgres`
- 密码：`root`
- 数据库：`flowmind`
- 连接串：`postgresql://postgres:root@localhost:5432/flowmind`

也可以使用 `docker-compose.yml` 启动 Docker Postgres。注意 Docker compose 默认账号是 `flowmind/flowmind`，与当前本机安装的 `postgres/root` 不同，切换时要同步修改 `.env`。

## 6. 构建、测试、类型检查

根目录：

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

单独跑前端：

```bash
corepack pnpm --filter @flowmind/web typecheck
corepack pnpm --filter @flowmind/web test
corepack pnpm --filter @flowmind/web build
```

单独跑后端：

```bash
corepack pnpm --filter @flowmind/api typecheck
corepack pnpm --filter @flowmind/api test
corepack pnpm --filter @flowmind/api build
```

最近一次已验证：

- `@flowmind/web` typecheck 通过
- `@flowmind/web` test 通过
- `@flowmind/web` build 通过

后续 agent 修改代码后，应至少跑对应 package 的 `typecheck`。涉及流式聊天或 API 行为时，同时跑相关 test。

## 7. 前端架构

前端入口：

- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`

主要路由：

```text
/                         LandingPage
/app/dashboard            DashboardPage
/app/chat                 ChatPage
/app/knowledge            KnowledgePage
/app/mcp                  McpPage
/app/lowcode              LowCodePage
/app/models               DataModelsPage
/app/settings             SettingsPage
```

应用布局：

- `apps/web/src/layouts/AppLayout.tsx`
- 顶部栏：`apps/web/src/components/AppTopBar.tsx`
- 导航配置：`apps/web/src/navigation.ts`

API 封装：

- `apps/web/src/api.ts`
- `API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000"`
- 业务请求统一拼接 `${API_BASE_URL}/api${path}`

注意：`apiGet`、`apiPost` 当前带 fallback 机制，非 OK 或异常时会返回 fallback，不一定抛错。`apiCreate`、`apiPatch`、`apiDelete` 会抛错。

## 8. AI 对话前端实现

主要文件：

- `apps/web/src/pages/app/ChatPage.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/ChatMessageList.tsx`
- `apps/web/src/components/chat/ChatWelcome.tsx`
- `apps/web/src/components/chat/QuickPromptGrid.tsx`
- `apps/web/src/components/chat/chatData.ts`

### 当前交互

`ChatPage` 是两栏布局：

- 左侧：Postgres-backed 会话列表
  - 新建会话
  - 选择会话
  - 内联重命名
  - 删除会话，后端是软删除
  - 移动端抽屉展示
- 右侧：消息流与输入框
  - 加载当前会话消息
  - 发送后立即插入本地 user message 和空 assistant message
  - 后端 `message.created` 返回后替换本地 user message
  - 后端 `chat.token` 到达后进入前端打字机队列
  - 后端 `chat.done` 到达后等待打字机队列清空，再合并最终 assistant message

### 流式消费

`apps/web/src/api.ts` 中：

- `streamChatMessage(conversationId, content, onEvent)`
- 使用 `fetch`
- 从 `response.body.getReader()` 读取 `ReadableStream`
- 按 `\n\n` 切分 SSE 事件
- `parseSseEvent` 读取 `data:` 行并 JSON.parse 为 `ChatStreamEvent`

### 打字机效果

`ChatPage.tsx` 中维护：

- `typewriterQueueRef`: 待展示字符队列
- `typewriterTimerRef`: 定时器
- `pendingDoneMessageRef`: 后端最终 assistant message
- `typingResolversRef`: 等待打字机结束的 Promise resolver

当前策略：

- 每次最多追加 2 个字符
- tick 间隔约 22ms
- `chat.done` 不立即重挂载消息节点，避免滚动条明显跳动
- 保留本地 assistant message 的 React `key`

### 自动滚动

使用 `use-stick-to-bottom`，不是手写滚动监听：

```tsx
<StickToBottom
  className="chat-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-2"
  initial="instant"
  resize="instant"
>
```

当前行为：

- 用户停留底部时，流式消息增长自动贴底。
- 用户向上滚动后，自动贴底取消。
- 不在底部时展示“回到底部”按钮。
- 点击“回到底部”时使用平滑 spring 动画。

`resize="instant"` 是有意选择：之前 `resize="smooth"` 会在消息增长时出现滚动条先上移再回到底部的可见补偿动画。

滚动条主题样式在 `apps/web/src/styles.css`：

- `.chat-scrollbar`
- 包含 Firefox `scrollbar-width/color`
- WebKit `::-webkit-scrollbar` track/thumb/hover
- `scrollbar-gutter: stable`
- `overscroll-behavior: contain`

## 9. 后端架构

后端入口：

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`

`main.ts` 行为：

- 创建 Nest app
- 开启 CORS：`origin: true`, `credentials: true`
- 设置全局 API 前缀：`api`
- 监听 `API_PORT`，默认 4000

`AppModule` 导入模块：

- `AuthModule`
- `OrganizationsModule`
- `DashboardModule`
- `KnowledgeModule`
- `ChatModule`
- `McpModule`
- `DataModelsModule`
- `LowCodeModule`
- `TasksModule`

## 10. AI 对话后端实现

主要文件：

- `apps/api/src/modules/chat/chat.module.ts`
- `apps/api/src/modules/chat/chat.controller.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/chat/chat.repository.ts`
- `apps/api/src/modules/chat/llm-client.ts`
- `apps/api/src/modules/chat/llm-client.spec.ts`

### REST/SSE API

所有路径都带 `/api` 前缀。

```text
GET    /api/chat/conversations
POST   /api/chat/conversations
PATCH  /api/chat/conversations/:id
DELETE /api/chat/conversations/:id
GET    /api/chat/conversations/:id/messages
POST   /api/chat/conversations/:id/messages/stream
```

`POST /messages/stream`：

- 请求体：`{ "content": "用户输入" }`
- 响应：`text/event-stream; charset=utf-8`
- 每个事件格式：

```text
event: chat.token
data: {"type":"chat.token","payload":{"token":"..."}}
```

### SSE 事件类型

定义在 `packages/shared/src/index.ts`：

```ts
type ChatStreamEvent =
  | { type: "message.created"; payload: { message: ChatMessage } }
  | { type: "chat.token"; payload: { token: string } }
  | { type: "chat.done"; payload: { message: ChatMessage } }
  | { type: "chat.error"; payload: { message: string } };
```

### ChatService 流程

`ChatService.streamMessage` 当前流程：

1. trim 用户输入，空内容直接 emit `chat.error`。
2. 查询会话是否存在且未删除。
3. 查询历史消息。
4. 写入 user message 到 Postgres。
5. emit `message.created`。
6. 如果这是新对话第一条消息，按用户输入生成标题。
7. 拼接模型消息：
   - system prompt
   - 历史 user/assistant 消息
   - 当前 user message
8. 调用 `LlmClient.streamChat`。
9. 每收到一个 token：
   - 累加到 `answer`
   - emit `chat.token`
10. 流结束后写入 assistant message。
11. emit `chat.done`。
12. 如果模型调用失败：
   - emit `chat.error`
   - 不写入 assistant message
   - user message 已经保存

当前组织 ID 固定：

```ts
const ORGANIZATION_ID = "org_1";
```

后续接入真实认证/多租户时，需要从 JWT/session 中取 organizationId，而不是使用常量。

### LlmClient

`apps/api/src/modules/chat/llm-client.ts`

配置优先级：

```text
baseUrl: LLM_BASE_URL -> DEEPSEEK_BASE_URL -> OPENAI_BASE_URL -> https://api.deepseek.com
model:   LLM_MODEL    -> DEEPSEEK_MODEL    -> OPENAI_MODEL    -> deepseek-v4-flash
apiKey:  LLM_API_KEY  -> DEEPSEEK_API_KEY  -> OPENAI_API_KEY  -> ""
```

请求：

```http
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer <apiKey>
```

请求体：

```json
{
  "model": "deepseek-v4-flash",
  "stream": true,
  "temperature": 0.2,
  "messages": []
}
```

响应解析：

- 按 OpenAI-compatible SSE 解析 `data:` 行。
- 支持 `choices[0].delta.content`。
- 兼容 `choices[0].message.content`。
- 忽略 `[DONE]`、空行、keepalive、无法 JSON.parse 的行。

## 11. 聊天数据库结构

`ChatRepository.ensureSchema()` 在模块启动时自动建表，不使用迁移工具。

### chat_conversations

```sql
CREATE TABLE IF NOT EXISTS chat_conversations (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  title text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_chat_conversations_active
ON chat_conversations (organization_id, updated_at DESC)
WHERE deleted_at IS NULL;
```

### chat_messages

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
ON chat_messages (conversation_id, created_at ASC);
```

删除会话是软删除：

```sql
UPDATE chat_conversations
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
```

消息没有软删除；如果会话被硬删，messages 会因 FK `ON DELETE CASCADE` 被级联删除。

## 12. 共享类型与 schema

共享类型在 `packages/shared/src/index.ts`。

重要定义：

- 组织角色：`owner`, `admin`, `member`
- 权限：`organization.manage`, `chat.use`, `mcp.invoke` 等
- `ChatConversation`
- `ChatMessage`
- `ChatStreamEvent`
- `ChatPart`：当前支持 `text`、`card`、`table`
- `RagCitation`
- `KnowledgeDocument`
- `McpServer`
- `McpTool`
- `McpInvocation`
- `DataModel`
- `LowCodePage`

前后端都从 `@flowmind/shared` 导入聊天类型，改协议时必须同步更新这里。

## 12.1 结构化聊天组件协议

当前 assistant 消息除了纯文本 `content`，还支持 `parts`：

```ts
type ChatPart =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "card"; props: CardProps }
  | { id: string; type: "table"; props: TableProps };
```

后端允许模型用如下标签输出结构化组件：

```text
<fm-part>
{"type":"card","props":{"title":"高风险客户","tone":"warning","meta":[{"label":"等级","value":"高"}]}}
</fm-part>
```

约束：

- 前端不渲染模型生成的 HTML、JS 或 className。
- 后端使用 `chatPartSchema` 校验，只允许白名单组件。
- 普通文本继续走 `chat.token`。
- 结构化组件走 `chat.part`。
- 完整 assistant message 在 `chat.done` 中返回，并保存到 `chat_messages.parts jsonb`。

相关文件：

- `packages/shared/src/index.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/chat/chat.repository.ts`
- `apps/web/src/components/chat/ChatMessageList.tsx`

## 13. 其他后端模块状态

当前除 chat 外，大部分模块仍使用 `apps/api/src/common/mock-store.ts`。

### Auth

文件：

- `apps/api/src/modules/auth/auth.controller.ts`

接口：

```text
POST /api/auth/login
GET  /api/auth/me
```

现状：

- 从 `mockStore.users` 返回演示用户。
- 登录签发 JWT。
- 当前没有全局 auth guard，很多接口没有鉴权。

### Dashboard

文件：

- `apps/api/src/modules/dashboard/dashboard.controller.ts`

接口：

```text
GET /api/dashboard
```

现状：

- 基于 `mockStore` 计算仪表盘指标。

### Knowledge

文件：

- `apps/api/src/modules/knowledge/knowledge.controller.ts`

接口：

```text
GET  /api/knowledge/documents
POST /api/knowledge/documents
```

现状：

- 只保存 mock document metadata。
- 未真实上传文件。
- 未真实解析、向量化、检索。
- `MAX_DOCUMENT_BYTES` 用于限制请求中的 `sizeBytes`。

### MCP

文件：

- `apps/api/src/modules/mcp/mcp.controller.ts`

接口：

```text
GET  /api/mcp/servers
GET  /api/mcp/invocations
POST /api/mcp/invocations
POST /api/mcp/invocations/:id/confirm
```

现状：

- 基于 mock server/tool/invocation。
- 没有真实 MCP client 调用。
- 高风险工具会进入 `pending_confirmation`。

### Data Models

文件：

- `apps/api/src/modules/data-models/data-models.controller.ts`

接口：

```text
GET /api/data-models
```

现状：

- 返回 mock data models。

### Low Code

文件：

- `apps/api/src/modules/low-code/low-code.controller.ts`

接口：

```text
GET  /api/low-code/pages
POST /api/low-code/pages
POST /api/low-code/pages/:id/publish
```

现状：

- 使用 `lowCodePageSchema.parse` 校验输入。
- 保存到内存 mock store。

### Tasks

文件：

- `apps/api/src/modules/tasks/tasks.controller.ts`

接口：

```text
GET /api/tasks/stream
```

现状：

- 使用 Nest `@Sse` 和 RxJS interval 模拟任务进度。

## 14. 前端页面状态

### DashboardPage

- 从 `/api/dashboard` 读取指标。
- API 失败时使用 `fallbackDashboard`。

### ChatPage

- 当前最完整业务页面。
- 使用真实 Postgres 会话和真实 LLM 流。
- 后续优先维护这里时，请同时检查 `api.ts`、shared 类型、后端 chat 模块。

### KnowledgePage

- 对接 `/api/knowledge/documents`。
- 当前后端仍是 mock metadata，不是真实文件上传/RAG。

### McpPage

- 对接 `/api/mcp/servers`、`/api/mcp/invocations`。
- 当前后端仍是 mock invocation。

### LowCodePage

- 对接 `/api/low-code/pages`。
- 当前低代码保存只在后端内存中，不持久化。

### DataModelsPage

- 对接 `/api/data-models`。
- 当前返回 mock data models。

## 15. 样式与 UI 约定

全局样式：

- `apps/web/src/styles.css`

Tailwind 配置：

- `apps/web/tailwind.config.ts`

主题色大致为：

- Ink: `#101828`
- Brand blue: `#2684ff`
- Mint: `#15b79e`
- Amber: `#f79009`
- 当前聊天页大量使用青绿色：`#0f766e`, `#e8f4f2`, `#eef7f5`

共享 primitives：

- `packages/ui/src/primitives.tsx`
- `Button`
- `Card`
- `Badge`
- `Input`

注意：

- 前端大量页面直接使用 Tailwind class，UI package 还比较薄。
- 聊天页滚动条主题在 `.chat-scrollbar`。

## 16. 编码注意事项

源码是 UTF-8。Windows PowerShell 读取中文文件时，如果不指定编码，可能显示乱码。建议：

```powershell
Get-Content -Encoding UTF8 -Path apps/web/src/pages/app/ChatPage.tsx
```

或使用编辑器直接打开。不要因为终端显示乱码就误判源文件已损坏。

## 17. 关键开发入口

### 修改大模型提供商

优先改环境变量，不改代码：

```dotenv
LLM_BASE_URL=...
LLM_API_KEY=...
LLM_MODEL=...
```

如果 provider 的 SSE 格式不是 OpenAI-compatible，改：

- `apps/api/src/modules/chat/llm-client.ts`
- `parseOpenAIStreamLine`
- 对应测试：`apps/api/src/modules/chat/llm-client.spec.ts`

### 修改聊天协议

同步改：

- `packages/shared/src/index.ts`
- `apps/api/src/modules/chat/chat.controller.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/web/src/api.ts`
- `apps/web/src/pages/app/ChatPage.tsx`

### 增加聊天字段

例如增加 token usage、latency、provider request id：

1. 改 `packages/shared/src/index.ts` 类型/schema。
2. 改 `ChatRepository.ensureSchema()` 建表或补列。
3. 如果开始严肃使用生产数据库，应引入迁移工具，不要继续靠 `ensureSchema()` 管理复杂 schema 变更。
4. 改 `toMessage`/`toConversation` 映射。
5. 改前端展示。
6. 补测试。

### 接入真实 RAG

当前 `citations` 字段已经贯穿 shared、DB、前端展示，但总是空数组。

建议路径：

1. 先把 `KnowledgeModule` 从 mock metadata 改成 Postgres-backed document repository。
2. 增加文件上传与对象/数据库存储。
3. 增加解析与 chunk。
4. 使用 pgvector 存 embedding。
5. 在 `ChatService.streamMessage` 调用 LLM 前检索 top-k chunks。
6. 将检索结果注入 system/context message。
7. 将实际引用写入 assistant message 的 `citations`。

### 接入真实 MCP

当前 MCP 是 mock invocation。

建议路径：

1. 为 MCP server/tool/invocation 建 Postgres 表。
2. 实现 MCP client transport：stdio/http/sse。
3. 按 `requiresConfirmation` 做调用前确认。
4. 给工具调用增加审计日志。
5. 将工具调用事件扩展到 chat SSE 或 task SSE。

### 接入真实鉴权和多租户

当前问题：

- `ChatService` 写死 `org_1`。
- 很多接口无 guard。
- Auth 只返回 mock 用户。

建议路径：

1. 增加 JWT auth guard。
2. 从 request user 上下文获取 `userId`、`organizationId`、`role`。
3. 用 `hasPermission` 做权限检查。
4. 后端 repository 查询都带 organization scope。
5. 前端处理登录态、token 存储和 401。

## 18. 当前已知风险和技术债

1. 只有 Chat 真实持久化；其他模块大多是 mock。
2. 没有数据库迁移工具；chat 表在服务启动时 `CREATE TABLE IF NOT EXISTS`。
3. `ORGANIZATION_ID` 写死为 `org_1`。
4. 鉴权未真正保护 API。
5. LLM 调用没有显式 timeout、abort、重试、速率限制。
6. LLM API key 在本地 `.env`，不要提交。
7. 前端 `apiGet` 会吞掉部分异常并返回 fallback，排查问题时要注意。
8. Chat 流失败时会保存 user message，但不会保存 assistant error message。
9. 当前没有端到端测试覆盖真实浏览器发送聊天。
10. Docker compose 和本机 Postgres 的默认账号不一致，切换环境时容易连错库。
11. `dist/` 目录存在构建产物；开发时主要看 `src/`。

## 19. 排障清单

### Web 打不开

检查端口：

```powershell
Test-NetConnection -ComputerName localhost -Port 5173
```

重新启动：

```bash
corepack pnpm dev:stop
corepack pnpm dev
```

### API 打不开

检查端口：

```powershell
Test-NetConnection -ComputerName localhost -Port 4000
```

检查 `.env` 是否在项目根目录，尤其是 `DATABASE_URL`。

### 聊天报数据库错误

检查 Postgres 是否运行，数据库是否存在：

```text
host: localhost
port: 5432
database: flowmind
```

当前本机预期连接串：

```dotenv
DATABASE_URL=postgresql://postgres:root@localhost:5432/flowmind
```

如果使用 Docker compose，则连接串应匹配 `flowmind/flowmind`。

### 聊天报模型错误

检查：

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- DeepSeek 账号额度
- 后端日志中的 `LLM request failed with ...`

注意不要把 API key 粘贴进 issue、文档或聊天记录。

### 前端流式无输出

检查：

1. 浏览器 Network 中 `/api/chat/conversations/:id/messages/stream` 是否返回 `text/event-stream`。
2. 后端是否 emit `message.created`。
3. 后端是否从 LLM 收到 token。
4. `apps/web/src/api.ts` 的 `parseSseEvent` 是否能解析实际响应。
5. `ChatPage.tsx` 的 `applyStreamEvent` 是否处理对应事件类型。

### 打字机或滚动异常

相关位置：

- `ChatPage.tsx` 中 `typewriterQueueRef`、`startTypewriter`
- `StickToBottom` 配置
- `styles.css` 中 `.chat-scrollbar`

不要轻易改回 `resize="smooth"`；它会在流式内容增长时造成滚动条明显补偿动画。

## 20. 推荐后续路线

如果后续 agent 继续开发，建议按以下优先级推进：

1. 给 Chat 后端增加 integration test：真实解析 mock SSE stream、错误路径、历史消息入参。
2. 增加 LLM timeout/abort 支持，前端允许停止生成。
3. 引入数据库迁移工具，替代 `ensureSchema()` 的复杂 schema 管理。
4. 把 `org_1` 替换为真实 auth context。
5. 把 Knowledge 从 mock 改为 Postgres-backed，为 RAG 做准备。
6. 实现 RAG citations，复用当前 `citations` 字段。
7. 给聊天页加 Playwright 或等价 E2E 测试，覆盖发送、流式展示、刷新持久化、用户上滑取消自动滚动。
8. 清理 `apiGet` fallback 策略，避免生产问题被静默吞掉。

## 21. 快速理解代码的阅读顺序

新 agent 推荐按这个顺序读：

1. `README.md`
2. `.env.example`
3. `package.json`
4. `apps/api/src/main.ts`
5. `apps/api/src/app.module.ts`
6. `packages/shared/src/index.ts`
7. `apps/api/src/modules/chat/chat.controller.ts`
8. `apps/api/src/modules/chat/chat.service.ts`
9. `apps/api/src/modules/chat/chat.repository.ts`
10. `apps/api/src/modules/chat/llm-client.ts`
11. `apps/web/src/api.ts`
12. `apps/web/src/pages/app/ChatPage.tsx`
13. `apps/web/src/components/chat/ChatMessageList.tsx`
14. `apps/web/src/components/chat/ChatComposer.tsx`
15. `apps/web/src/styles.css`

读完这些，基本可以理解当前最核心的真实 AI 对话功能。

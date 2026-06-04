# FlowMindStudio

FlowMindStudio is a TypeScript monorepo for a SaaS AI workspace with RAG, MCP, agent workflow foundations, and a low-code admin page builder.

## Apps

- `apps/web`: React + Vite + Tailwind frontend.
- `apps/api`: NestJS API with REST and SSE endpoints.
- `packages/shared`: shared DTOs, enums, and schemas.
- `packages/ui`: shared shadcn-inspired UI primitives.

## Local Development

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm dev
```

The frontend runs on `http://localhost:5173` and the API runs on `http://localhost:4000`.

## MVP Coverage

- Organization multi-tenancy and `Owner/Admin/Member` roles.
- AI dashboard, chat workspace, knowledge base, MCP configuration, data models, low-code builder, and organization settings.
- RAG document upload model with database-backed file storage for MVP.
- OpenAI-compatible provider abstraction and LangGraph-ready agent workflow contracts.
- MCP client/server configuration surfaces and audit-friendly tool invocation records.
- REST APIs plus SSE streams for chat tokens, RAG references, tool calls, task progress, and agent node events.

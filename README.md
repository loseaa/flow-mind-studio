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

For local development, Docker only needs to run PostgreSQL and Redis. Check them with
`docker compose ps`, then verify the API and dependencies at `GET /api/health`.

Run `pnpm --filter @flowmind/api mock:mcp` to start three local test MCP endpoints on port 4100:
`/crm/mcp`, `/tickets/mcp`, and `/analytics/mcp`.

The frontend runs on `http://localhost:5173` and the API runs on `http://localhost:4000`.

## Git and CI/CD

See `docs/GIT_CICD.md` for the current branch workflow, local Git hooks, merge checks, and GitHub Actions troubleshooting.

## MVP Coverage

- Organization multi-tenancy and `Owner/Admin/Member` roles.
- AI dashboard, chat workspace, knowledge base, MCP configuration, data models, low-code builder, and organization settings.
- RAG document upload model with database-backed file storage for MVP.
- OpenAI-compatible provider abstraction and LangGraph-ready agent workflow contracts.
- MCP client/server configuration surfaces and audit-friendly tool invocation records.
- REST APIs plus SSE streams for chat tokens, RAG references, tool calls, task progress, and agent node events.

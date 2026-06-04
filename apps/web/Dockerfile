FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --filter @flowmind/web... --frozen-lockfile=false

FROM deps AS runner
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/ui packages/ui
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev"]

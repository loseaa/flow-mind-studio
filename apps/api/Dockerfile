FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @flowmind/api... --frozen-lockfile=false

FROM deps AS build
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY infra/postgres/migrations infra/postgres/migrations
RUN pnpm --filter @flowmind/shared build && pnpm --filter @flowmind/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/infra/postgres/migrations infra/postgres/migrations
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/semantic-core/package.json packages/semantic-core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @lingdong/api...

COPY packages/contracts packages/contracts
COPY packages/semantic-core packages/semantic-core
COPY apps/api apps/api
RUN pnpm --filter @lingdong/contracts build \
 && pnpm --filter @lingdong/semantic-core build \
 && pnpm --filter @lingdong/api build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8280
COPY --from=builder /app /app
EXPOSE 8280
CMD ["node", "apps/api/dist/server.js"]

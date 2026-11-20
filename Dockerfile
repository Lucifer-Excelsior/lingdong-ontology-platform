FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/semantic-core/package.json packages/semantic-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps
RUN pnpm --filter @lingdong/contracts build \
 && pnpm --filter @lingdong/semantic-core build \
 && pnpm --filter @lingdong/api build \
 && pnpm --filter @lingdong/web build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=demo
ENV PORT=8280
ENV WEB_DIST_DIR=/app/apps/web/dist
COPY --from=builder /app /app
EXPOSE 8280
CMD ["./apps/api/node_modules/.bin/tsx", "apps/api/src/server.ts"]

FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @lingdong/web...

COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @lingdong/contracts build && pnpm --filter @lingdong/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

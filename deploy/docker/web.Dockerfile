# syntax=docker/dockerfile:1.7

FROM node:25-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile

COPY . .

FROM base AS dev
ENV NODE_ENV=development
EXPOSE 5173
CMD ["pnpm", "--filter", "@nis2/web", "dev", "--host", "0.0.0.0"]

FROM base AS build
RUN pnpm --filter @nis2/shared build && pnpm --filter @nis2/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

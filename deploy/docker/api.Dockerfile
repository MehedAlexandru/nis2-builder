# syntax=docker/dockerfile:1.7

# Cross-compile the scanner agent so the API can serve downloads directly.
FROM golang:1.27-alpine AS agent-build
WORKDIR /src
ARG AGENT_VERSION=0.1.0
COPY apps/scanner-agent/go.mod ./
COPY apps/scanner-agent ./
RUN mkdir -p /out \
  && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${AGENT_VERSION}" -o /out/nis2-scanner-agent-linux-amd64 ./cmd/agent \
  && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${AGENT_VERSION}" -o /out/nis2-scanner-agent-linux-arm64 ./cmd/agent \
  && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${AGENT_VERSION}" -o /out/nis2-scanner-agent-windows-amd64.exe ./cmd/agent \
  && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${AGENT_VERSION}" -o /out/nis2-scanner-agent-darwin-amd64 ./cmd/agent \
  && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${AGENT_VERSION}" -o /out/nis2-scanner-agent-darwin-arm64 ./cmd/agent \
  && cd /out && sha256sum nis2-scanner-agent-* > SHA256SUMS

# Shared dependency layer.
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate \
  && apk add --no-cache font-dejavu
WORKDIR /app
COPY --from=agent-build /out /opt/nis2-agent

# Install with the lockfile before copying sources for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile

COPY . .

# Local development with hot reload.
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@nis2/api", "dev"]

# Build shared contracts, generate the Prisma client and compile the API.
FROM base AS build
RUN pnpm --filter @nis2/shared build && pnpm --filter @nis2/api build

# Runtime. Phase 9 replaces this with a pruned, distroless-style image.
# The worker uses the same image with `node apps/api/dist/worker.js`.
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate \
  && apk add --no-cache font-dejavu \
  && addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app /app
COPY --from=agent-build --chown=app:app /out /opt/nis2-agent
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "apps/api/dist/main.js"]

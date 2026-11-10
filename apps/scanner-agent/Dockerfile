# syntax=docker/dockerfile:1.7
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
ARG VERSION=0.1.0
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X github.com/nis2-compass/scanner-agent/internal/version.Version=${VERSION}" \
    -o /out/nis2-scanner-agent ./cmd/agent

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/nis2-scanner-agent /nis2-scanner-agent
USER nonroot:nonroot
ENTRYPOINT ["/nis2-scanner-agent"]

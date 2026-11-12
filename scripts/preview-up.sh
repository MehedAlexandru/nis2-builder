#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Starting dependencies..."
docker compose up -d postgres redis minio mailpit minio-init

echo "Building API, worker and web images..."
docker compose build api worker web

echo "Applying migrations..."
docker compose run --rm api pnpm --filter @nis2/api prisma:migrate:deploy

echo "Seeding demo organization and templates..."
docker compose run --rm api pnpm --filter @nis2/api prisma:seed

echo "Starting API, worker and web..."
docker compose up -d --no-build api worker web

echo "Waiting for the API health check..."
attempt=0
until docker compose exec -T api wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "API did not become healthy. Recent logs:"
    docker compose logs api --tail=80
    exit 1
  fi
  sleep 2
done

cat <<'EOF'

NIS2 Compass is running.

  1. Open the Ports panel.
  2. Right-click port 5173 and choose Port Visibility -> Public.
  3. Open the generated URL. Keep API/Postgres/MinIO ports private.

Demo login: owner@demo.local / Demo!Passw0rd123

In a GitHub Codespace, the URL can also be made public with:
  gh codespace ports visibility 5173:public -c "$CODESPACE_NAME"

This preview is temporary and ends when the Codespace stops.
EOF

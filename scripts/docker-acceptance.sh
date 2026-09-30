#!/usr/bin/env bash
set -euo pipefail
deployment_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$deployment_root"
command -v docker >/dev/null || { echo "Docker is required for Compose acceptance" >&2; exit 2; }
export PROVIDER_STORE=memory DYNAMO_TABLE= DYNAMO_ENDPOINT= TELEMETRY_MODE=off NEXT_PUBLIC_SENTRY_DSN=
compose=(docker compose --env-file /dev/null)
trap '"${compose[@]}" --profile dynamo down -v' EXIT
"${compose[@]}" --profile dynamo down -v
"${compose[@]}" build
"${compose[@]}" up --build -d --wait
node scripts/smoke.mjs
"${compose[@]}" down
export PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://dynamodb:8000
"${compose[@]}" --profile dynamo up --build -d --wait
"${compose[@]}" exec -T dynamodb sh -c 'test -w /data'
"${compose[@]}" run --rm dynamodb-init
"${compose[@]}" exec -T rest bun run scripts/seed-once.ts
node scripts/smoke.mjs
(cd ../rest-api && PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://127.0.0.1:8000 bun --no-env-file --bun run test:dynamo)
"${compose[@]}" restart dynamodb
"${compose[@]}" exec -T dynamodb sh -c 'test -w /data && test -n "$(ls -A /data)"'

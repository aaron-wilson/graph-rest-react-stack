#!/usr/bin/env bash
set -euo pipefail
deployment_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$deployment_root"
command -v docker >/dev/null || { echo "Docker is required for Compose acceptance" >&2; exit 2; }
export PROVIDER_STORE=memory DYNAMO_TABLE= DYNAMO_ENDPOINT= TELEMETRY_MODE=off NEXT_PUBLIC_SENTRY_DSN=
# Never delete the operator's persistent wander demo volume, even on failure.
# Use the fixed project/file explicitly so inherited Compose settings cannot redirect cleanup.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES
compose=(docker compose --project-name wander-acceptance --file "$deployment_root/compose.yaml" --env-file /dev/null)
persistence_snapshot="$(mktemp)"
cleanup() {
  rm -f "$persistence_snapshot"
  "${compose[@]}" --profile dynamo down -v
}
trap cleanup EXIT
"${compose[@]}" --profile dynamo down -v
"${compose[@]}" build
"${compose[@]}" up --build -d --wait rest graph ui
node scripts/smoke.mjs
"${compose[@]}" down
export PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://dynamodb:8000
"${compose[@]}" --profile dynamo up -d dynamodb
"${compose[@]}" exec -T dynamodb sh -c 'test -w /data'
# The build-stage tools service waits for DynamoDB, then creates the table.
"${compose[@]}" --profile dynamo run --build --rm --no-deps dynamodb-init
(cd ../rest-api && PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://127.0.0.1:8000 bun --no-env-file --bun run test:dynamo)
# Seed only after the contract's destructive resets; runtime REST has no scripts/src.
"${compose[@]}" --profile dynamo run --rm --no-deps dynamodb-init bun run scripts/seed-once.ts
"${compose[@]}" up --build -d --wait rest graph ui
node scripts/smoke.mjs
node scripts/check-local-persistence.mjs capture "$persistence_snapshot"
"${compose[@]}" restart dynamodb
node scripts/check-local-persistence.mjs verify "$persistence_snapshot"

#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: deploy-all.sh <environment> [--dry-run|--execute]" >&2
  exit 2
fi
case "${2:---dry-run}" in
  --dry-run|--execute) ;;
  *) echo "Use --dry-run (default) or explicit --execute" >&2; exit 2 ;;
esac
deployment_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
exec env TSX_TSCONFIG_PATH="$deployment_root/platform-cdk/tsconfig.json"   node --import "$deployment_root/platform-cdk/node_modules/tsx/dist/loader.mjs"   "$deployment_root/scripts/deploy-plan.ts" "$1" "${2:---dry-run}"

# Wander reference stack

Wander is a trip planner with three independently runnable application layers: a static Next.js UI, a GraphQL Yoga planner, and a Bun/Hono domain API. This repository owns the teaching references, local Compose topology, foundation CDK app and deployment orchestration. Keep all four repositories in sibling directories.

| Repository               | Responsibility                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `react-ui`               | React interaction, typed urql operations, authenticated streaming, static MDX and local responsive images |
| `graph-api`              | GraphQL views, request-local DataLoader batching, planning providers and generation lifecycle             |
| `rest-api`               | Validated trip rules, ownership, versioned edits, memory/DynamoDB persistence and OpenAPI                 |
| `graph-rest-react-stack` | References, Compose, platform infrastructure, verification and release orchestration                      |

After dependencies and images are available, the default demo uses only local services: deterministic planning adapters, memory persistence, `Bearer demo` identity and disabled telemetry/browser reporting. Memory resets on REST restart. Optional DynamoDB Local provides durability. Live mode verifies Cognito tokens in both APIs and requires a public PKCE browser client.

## Run locally

Use the pinned lockfiles: Bun 1.2.21 for REST, pnpm 10.15.0 for graph/platform and pnpm 11.18.0 for UI. Containers and inactive workflows select Node 24; local verification records its actual runtime. Dependency setup is an explicit prerequisite, never part of a check.

From this directory, with Docker available:

```sh
docker compose --env-file /dev/null up --build -d --wait
node scripts/smoke.mjs
docker compose --env-file /dev/null down -v
```

The UI listens on `http://localhost:3001`, GraphQL on `http://localhost:4000/graphql`, and REST/Swagger on `http://localhost:3000/docs`. For installed host dependencies, each service README supplies a local command. No AWS account or vendor key is needed for the demo.

## Verification and releases

```sh
node scripts/verify-repo.mjs hub
node scripts/verify-repo.mjs rest-api
node scripts/verify-repo.mjs graph-api
node scripts/verify-repo.mjs react-ui --e2e
node scripts/check-env.mjs
node scripts/check-workflows.mjs
bash scripts/docker-acceptance.sh
```

These entrypoints use installed binaries, real tests and fake-input offline synth. Docker acceptance starts clean volumes, tests memory and DynamoDB profiles, inspects volume persistence and cleans up. It fails when Docker is unavailable. The UI command runs the installed Chrome journey; Firefox/WebKit need their existing Playwright browsers. Cloud deployments, real providers, hosted sign-in and vendor exports remain live-unverified. Workflow templates are deliberately inactive under `.github/workflow-templates/*.yml.disabled`; no automatic CI, deployment or scheduled activity is enabled. Deployment orchestration defaults to dry-run and requires explicit `--execute`.

## Learning index

[docs/README.md](docs/README.md) indexes the architecture, patterns, implementation inventory and verification evidence. [docs/verification.md](docs/verification.md) records local results and prerequisite gaps. The UI ships selected committed teaching snapshots and requires no documentation server at runtime.

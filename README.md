# wander

> AI Trip Planner: GraphQL Yoga, Bun/Hono REST, and a static React/Next.js UI.

---

## Table of Contents

- [Overview](#overview)
- [Scope](#scope)
- [Repositories](#repositories)
- [Tech Stack Overview](#tech-stack-overview)
- [Getting Started](#getting-started)
- [Testing & Deployment](#testing--deployment)

---

## Overview

A typed, tested three-tier application, called **Wander**, a trip planner. Wander's full local journey creates a trip, streams an itinerary, refines it, pins/swaps activities, saves it, and opens a public read-only share.

This hub contains the [architecture](docs/architecture.md), Docker Compose setup, shared AWS CDK foundation, and deployment tooling. The focus is how the technologies work together.

---

## Scope

- Typed API boundaries, runtime validation, and interchangeable planning/storage providers
- Unit, integration, browser, and infrastructure tests
- Containers, AWS infrastructure, and disabled CI/CD templates
- Optional API telemetry, browser monitoring, MDX, and build-time images

---

## Repositories

| Repository                                             | Responsibility         | Key features                                           |
| ------------------------------------------------------ | ---------------------- | ------------------------------------------------------ |
| [graph-api](https://github.com/aaron-wilson/graph-api) | GraphQL orchestration  | Yoga, DataLoader, provider adapters, authenticated SSE |
| [rest-api](https://github.com/aaron-wilson/rest-api)   | Domain and persistence | Hono, Zod, OpenAPI, memory/DynamoDB stores             |
| [react-ui](https://github.com/aaron-wilson/react-ui)   | Static frontend        | Next.js, React, urql, Tailwind, MDX, Sharp             |

---

## Tech Stack Overview

Versions reflect the committed dependency set; Node 24 is the container/workflow baseline.

| Layer               | GraphQL API                           | REST API                            | React UI                          |
| ------------------- | ------------------------------------- | ----------------------------------- | --------------------------------- |
| Language            | TypeScript 5.9.2                      | TypeScript 5.9.2                    | TypeScript 5.9.2                  |
| Runtime / framework | Node 24 · Yoga 5.15.1 · GraphQL 16.11 | Bun 1.2.21 · Hono 4.9.6             | Next 16.3.7 · React 19.3          |
| Package manager     | pnpm 10.15.0                          | Bun                                 | pnpm 11.18.0                      |
| Data / validation   | REST client · DataLoader · Zod 3      | DynamoDB DocumentClient · Zod 3     | urql 5.0.4 · Zod 4                |
| Authentication      | Cognito JWT                           | Cognito JWT                         | Cognito authorization code + PKCE |
| Testing             | Vitest 5 · Supertest                  | Vitest 5 · Supertest                | Vitest 5 · Playwright 1.63 · axe  |
| Deployment          | Docker · ECS Fargate · ALB            | Docker · ECS Fargate · internal ALB | Private S3 · CloudFront OAC       |
| Observability       | OpenTelemetry → optional New Relic    | OpenTelemetry → optional New Relic  | Optional Sentry 11.1              |
| Presentation        | —                                     | Swagger UI                          | Tailwind 4.3 · MDX 3 · Sharp 0.34 |

Shared infrastructure uses AWS CDK 2.271.0 (library), IAM, SSM and Secrets Manager. GitHub Actions definitions are disabled templates. Vite transforms UI tests; Next builds the application. Lambda, Step Functions, SSR and Server Actions are outside this implementation.

---

## Getting Started

Clone all four repositories as siblings. Choose one local mode:

- **Source development:** install dependencies and follow each application's README; REST uses `bun run dev`, graph/UI use `pnpm dev`.
- **Container demo:** from this hub, with Docker and host Node available:

```sh
docker compose --env-file /dev/null up --build -d --wait
node scripts/smoke.mjs
# Stop when finished:
docker compose --env-file /dev/null down
```

Open http://localhost:3001/. Both modes use ports 3000/4000/3001, so run one at a time. Defaults use mock providers, demo identity, memory storage and disabled reporting; no vendor account is required. Docker profiles add DynamoDB Local and telemetry.

---

## Testing & Deployment

With all application dependencies and `platform-cdk/` dependencies installed:

```sh
node scripts/verify-repo.mjs hub
node scripts/verify-repo.mjs rest-api
node scripts/verify-repo.mjs graph-api
node scripts/verify-repo.mjs react-ui --e2e
```

Local API/browser tests and offline infrastructure checks pass. Docker and live account verification remain pending. `scripts/docker-acceptance.sh` is the separate destructive-volume acceptance run.

`scripts/deploy-all.sh <environment> --dry-run` plans foundation → REST → graph → static UI from the inputs in [deployment.env.example](scripts/deployment.env.example); `--execute` deploys. The service stacks share `platform-cdk/node_modules`. Hosted APIs require Cognito and hosted REST uses DynamoDB. Workflow templates remain inactive until deliberately enabled.

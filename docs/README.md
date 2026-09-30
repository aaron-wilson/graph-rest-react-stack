# Learn the Wander stack

Wander's full local journey creates a trip, streams an itinerary, refines it, pins/swaps activities, saves it and opens a public read-only share. Defaults need only installed dependencies and local services. This index maps each retained technology to its actual responsibility and verification; installed packages alone are not evidence. Cloud/vendor activation is separate from implementation.

## Reading map

| Reference                                                                            | What it teaches                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                                                   | Separate durable domain rules from client-shaped orchestration and static presentation.                 |
| [verification.md](verification.md)                                                   | Exact local gates, results, runtime versions and unavailable prerequisites.                             |
| [patterns/config-and-secrets.md](patterns/config-and-secrets.md)                     | Parse settings at boundaries, validate only selected providers and separate public values from secrets. |
| [patterns/provider-pattern.md](patterns/provider-pattern.md)                         | Port/adapter design with deterministic defaults and normalized vendor failures.                         |
| [patterns/trip-persistence.md](patterns/trip-persistence.md)                         | Ownership, optimistic concurrency and interchangeable memory/DynamoDB stores.                           |
| [patterns/rest-security-and-openapi.md](patterns/rest-security-and-openapi.md)       | JWT/demo boundaries, public projections and schema-derived HTTP contracts.                              |
| [patterns/typed-graph-over-rest.md](patterns/typed-graph-over-rest.md)               | Validated REST clients, typed resolvers and request-local batching.                                     |
| [patterns/planning-providers.md](patterns/planning-providers.md)                     | Selected-only weather, places, events and LLM adapters with deterministic contracts.                    |
| [patterns/reliable-itinerary-streaming.md](patterns/reliable-itinerary-streaming.md) | Ordered events, replay, cancellation and deadlines within a single graph process.                       |
| [patterns/planning-journey.md](patterns/planning-journey.md)                         | The real three-service browser journey and accessible planning/edit/share behavior.                     |
| [patterns/static-ui-and-typed-client.md](patterns/static-ui-and-typed-client.md)     | Next static export and generated urql operations without request-time UI servers.                       |
| [patterns/static-ui-auth.md](patterns/static-ui-auth.md)                             | PKCE, in-memory tokens and identity cache clearing for a static frontend.                               |
| [patterns/static-docs-and-images.md](patterns/static-docs-and-images.md)             | Committed MDX snapshots and build-time Sharp variants with drift checks.                                |
| [patterns/local-showcase.md](patterns/local-showcase.md)                             | Memory/default Compose and the optional DynamoDB Local persistence profile.                             |
| [patterns/observability.md](patterns/observability.md)                               | API traces, metrics and correlated logs with optional collector routing.                                |
| [patterns/browser-monitoring.md](patterns/browser-monitoring.md)                     | Disabled browser reporting, event scrubbing and explicit source-map upload.                             |
| [patterns/foundation-deployment.md](patterns/foundation-deployment.md)               | Foundation resources, scoped IAM and deploy-time configuration outputs.                                 |
| [patterns/api-deployment.md](patterns/api-deployment.md)                             | Private Fargate services, selected secret injection and streaming rollout constraints.                  |
| [patterns/static-deployment.md](patterns/static-deployment.md)                       | Private S3/CloudFront OAC, static routing and ordered publication.                                      |
| [patterns/deployment-runbook.md](patterns/deployment-runbook.md)                     | Compatible revisions, dry-run orchestration and archived artifact reuse.                                |
| [patterns/inactive-ci-cd.md](patterns/inactive-ci-cd.md)                             | Local gate reuse, pinned sibling checkouts and deliberate workflow activation.                          |

## Implementation inventory

| Technology                        | Implemented use                                                                                      | Evidence and boundary                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| TypeScript / Node / pnpm / ESM    | Typed graph/UI and shared CDK toolchain; lockfiles pin package managers; Node 24 in images/templates | Typechecks and builds; local runtime version recorded separately                         |
| Bun / Hono / Zod                  | REST bootstrap, validation, domain schemas and Bun bundle                                            | Domain/store contracts and bound HTTP integration                                        |
| Yoga / Envelop / GraphQL          | Typed SDL/resolvers, depth/cost checks, HTTP and SSE subscriptions                                   | Schema/codegen drift and real graph integration                                          |
| DynamoDB / DocumentClient         | REST-owned adapter, conditional writes and paging                                                    | Adapter tests pass; real DynamoDB Local contract needs Docker and remains pending        |
| Cognito                           | API access-token verification and browser public-client PKCE                                         | Local auth rejection/isolation/callback tests; hosted sign-in and real JWKS unverified   |
| OpenAPI / Swagger UI              | Generated JSON and locally served interactive REST docs                                              | Snapshot byte comparison and API tests                                                   |
| DataLoader / urql / codegen       | Request-local REST batching and typed client operations                                              | Batching tests, generated resolver/operation drift and UI tests                          |
| React / Next App Router           | Static trip planner, saved/share pages and callback                                                  | UI tests, export route smoke and real Chrome journey                                     |
| Tailwind                          | Shared tokens, focus states and reusable controls                                                    | Component tests and browser accessibility checks                                         |
| Vite / Vitest / Supertest         | UI test transforms, all app suites and real bound API seams                                          | Tests run locally; Vite does not bundle the Next application                             |
| MDX / Sharp images                | Selected local doc snapshots and responsive AVIF/WebP assets                                         | Hash/sync checks and actual exported docs/assets                                         |
| Playwright                        | Real create/refine/pin/swap/save/share journey in three services                                     | Chrome available; other configured projects require installed browser executables        |
| Docker / Compose                  | Non-root images, health ordering, memory and dynamo profiles                                         | Acceptance script implemented; image/startup/smoke/volume checks pending Docker          |
| OpenTelemetry / New Relic         | API spans, metrics, correlated logs, collector routing and dashboard                                 | In-process exporter tests and dashboard checks; collector/runtime/vendor exports pending |
| Sentry                            | Disabled-by-default browser adapter, scrubbing and optional source-map upload                        | Local monitoring tests; vendor exports/uploads and alert activation unverified           |
| CDK / IAM / SSM / Secrets Manager | Foundation plus service stacks, scoped roles and deploy-time references                              | Four offline synths and assertion suites; no account calls or live secret retrieval      |
| ECS Fargate / ALB                 | REST/graph services with graph streaming and single-task rollout                                     | Template assertions; live service health/rollout unverified                              |
| S3 / CloudFront                   | Private static origin, OAC, route/cache policy, publication/invalidation                             | UI infra and archive fixtures plus static route checks; live CDN unverified              |
| Actions / CI/CD                   | Inert checks, image/smoke and manual OIDC deployment templates                                       | Local YAML/permission/checkout/inactivity checks; never activated or run                 |
| LLM / weather / places / events   | Mock and OpenAI/Anthropic/wttr/Overpass/Ticketmaster adapters                                        | Deterministic contracts and injected transport tests; no live provider calls             |

SSR, Server Actions, Lambda and Step Functions are deliberately outside the implemented architecture. Memory storage and generation state have different restart limits: REST memory loses trips, while graph restart loses pending jobs and replay even with a durable store. Multi-task recovery needs shared coordination. Default telemetry and Sentry are off; real credentials are never required for mock planning.

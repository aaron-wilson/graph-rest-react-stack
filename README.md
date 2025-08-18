# graph-rest-react-stack

> Centralized documentation for the project: GraphQL API (Yoga), REST API (Bun + Hono), and React UI (Next.js + Vite + urql).

## Table of Contents

* [Overview](#overview)
* [Scope](#scope)
* [Repositories](#repositories)
* [Tech Stack Overview](#tech-stack-overview)
* [Getting Started](#getting-started)
* [Contributing](#contributing)
* [License](#license)

---

## Overview

This repository serves as the centralized documentation hub. Describing the architecture, design decisions, and usage patterns across all three primary codebases:

1. **GraphQL API** — TypeScript-first, Yoga, DynamoDB, Cognito
2. **REST API** — TypeScript-first, Bun + Hono, DynamoDB, Cognito
3. **React UI** — TypeScript, Next.js + Vite, GraphQL (urql), Tailwind, Sentry

It provides reference guides, best practices, and setup instructions to onboard developers quickly and maintain consistency across services.

---

## Scope

* Architectural overviews for GraphQL and REST APIs and frontend React UI
* Coding conventions and type safety guidelines
* CI/CD and deployment patterns
* Testing strategy (unit, component, integration, E2E)
* Observability and monitoring guidance
* Optional tooling (MDX docs, image optimization)

---

## Repositories

| Repo                                                   | Purpose                   | Key Features                                                                                                     |
| ------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [graph-api](https://github.com/aaron-wilson/graph-api) | Yoga-based GraphQL server | Type-safe schema, DynamoDB, Cognito, OpenTelemetry + New Relic, Vitest + Supertest                               |
| [rest-api](https://github.com/aaron-wilson/rest-api)   | Bun + Hono backend        | Fully typed REST routes, OpenAPI, DynamoDB, Cognito, Vitest + Supertest + Playwright                             |
| [react-ui](https://github.com/aaron-wilson/react-ui)   | Frontend application      | Next.js + React, urql GraphQL client, Tailwind CSS, MDX docs, Vitest (unit/component) + Playwright (E2E), Sentry |

---

## Tech Stack Overview

| Layer                   | GraphQL API               | REST API                                        | React UI                                   |
| ----------------------- | ------------------------- | ----------------------------------------------- | ------------------------------------------ |
| **Language**            | TypeScript                | TypeScript                                      | TypeScript                                 |
| **Runtime / Framework** | Node.js 20 + Yoga         | Bun + Hono                                      | Node.js + Next.js + React                  |
| **Database**            | AWS DynamoDB              | AWS DynamoDB                                    |                                            |
| **Auth**                | AWS Cognito               | AWS Cognito                                     | GraphQL client integration (urql)          |
| **Validation**          | Zod                       | Zod                                             |                                            |
| **Testing**             | Vitest + Supertest        | Vitest + Supertest + Playwright                 | Vitest (unit/component) + Playwright (E2E) |
| **CI/CD**               | GitHub Actions + AWS CDK  | GitHub Actions + AWS CDK + Docker + ECS Fargate | GitHub Actions + AWS CDK + S3 + CloudFront |
| **Observability**       | OpenTelemetry → New Relic | OpenTelemetry → New Relic                       | Sentry (frontend errors & performance)     |
| **Styling**             |                           |                                                 | Tailwind CSS                               |
| **Documentation**       |                           | OpenAPI                                         | MDX documentation                          |

---

## Getting Started

### Developer Onboarding

1. Clone the individual repositories.
2. Follow the respective README for environment setup, local development, and testing.
3. Refer to this documentation repo for:

   * Architecture diagrams
   * CI/CD flow explanations
   * Observability & monitoring setup
   * API conventions and type safety patterns
   * Deployment guides for AWS resources

---

## Contributing

* Follow consistent **TypeScript-first** patterns
* Write **unit, component, integration, or E2E tests** as appropriate
* Ensure observability hooks (OpenTelemetry / Sentry) are included for new features
* Update documentation in this repo for architecture or API changes
* Submit PRs with clear descriptions and follow the repository’s linting rules

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

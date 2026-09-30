# Run the local showcase

Keep the hub, `graph-api`, `rest-api`, and `react-ui` in sibling directories. From the hub, run `docker compose up --build -d`, then `node scripts/smoke.mjs`. The UI is at `http://localhost:3001/`, GraphQL at `http://localhost:4000/graphql`, REST at `http://localhost:3000/`, and Swagger UI at `http://localhost:3000/docs`. The browser uses the host GraphQL URL built into the static UI. The GraphQL container uses `http://rest:3000` internally. All four planning providers use deterministic mocks and private operations accept `Bearer demo`.

The app images use non-root runtime users and health checks. Compose waits for the REST health route before GraphQL and for GraphQL before the UI. The REST memory store is the default and resets with the container. `node scripts/smoke.mjs` creates a trip, reads its authenticated SSE stream, confirms persistence, creates a share link, and reads its public projection.

For local durability, first run `docker compose --profile dynamo up -d dynamodb`, then `docker compose --profile dynamo run --rm dynamodb-init`. Start the stack with `PROVIDER_STORE=dynamo DYNAMO_TABLE=wander-local DYNAMO_ENDPOINT=http://dynamodb:8000 docker compose --profile dynamo up --build -d`. The `dynamodb-data` volume survives container restart. The init command is idempotent; `docker compose down -v` deletes the volume and its data. No AWS account is needed. The DynamoDB endpoint is accepted only for a local host or the Compose service name.

The images are prepared for local development and later CDK deployment. A Docker daemon is required to verify image builds, Compose startup, and the smoke run; source-only checks do not prove those runtime paths.

# Trip persistence and access patterns

The REST service owns trips. GraphQL will access them through REST; it will not read the store directly. Each trip is one versioned document with an owner ID, days, activities, preferences, timestamps, and an optional share token. The memory adapter is the current implementation. It loses every write when the REST process exits.

## Access patterns

| Operation | Key or filter | Result |
| --- | --- | --- |
| Read or delete a trip | Owner ID and trip ID | One private document |
| List trips | Owner ID, ascending trip ID, opaque cursor | Up to 100 documents |
| Batch read | Owner ID and trip IDs | Existing documents in input order |
| Public share | Owner ID, trip ID, unpredictable token | Trip ID, city, days, and update time only |

The store requires an expected version on writes and deletes. A create expects no existing record and starts at version 1. Each edit increments the version; a stale expected version returns a conflict. Cursor pagination uses ascending, locale-independent code-unit order on trip IDs and encodes the last ID. A cursor is scoped by the caller's owner ID during listing. Paging is not a snapshot: an insert before the last returned ID will not appear later in that traversal. The memory adapter copies values on reads and writes to keep callers from mutating stored data accidentally.

`POST /trips`, `GET /trips/:id`, and `GET /trips` currently use the fixed `demo` owner until authentication arrives. Run `bun run seed` to start a local REST server with three deterministic city trips, or call the store's `reset(demoTrips())` in a test. That command resets only its own process; it does not populate another running server. Restarting any memory-backed server clears its data. No share URL is exposed yet; the domain service has a public projection that omits owner and preferences.

The DynamoDB adapter stores each document as one item with `PK = OWNER#<ownerId>` and `SK = TRIP#<tripId>`. For example, Lisbon for the demo owner uses `PK = OWNER#demo` and `SK = TRIP#00000000-0000-4000-8000-000000000001`. `GetItem` and conditional `PutItem`/`DeleteItem` handle single trips; a partition `Query` lists trips in binary key order; `BatchGetItem` reads requested keys and retries unprocessed keys up to five times. No secondary index is needed for these access patterns. Stored responses are schema-validated before reaching the service. A conditional failure becomes a version conflict; other provider failures become a safe store-unavailable error.

Select `PROVIDER_STORE=dynamo` with `DYNAMO_TABLE` and `AWS_REGION`. An optional `DYNAMO_ENDPOINT` must be a local HTTP endpoint; only that mode supplies fake SDK credentials and enables reset. With no endpoint, the AWS SDK credential chain is used. For a local database, start DynamoDB Local on port 8000, set `PROVIDER_STORE=dynamo DYNAMO_TABLE=WanderTrips DYNAMO_ENDPOINT=http://localhost:8000`, then run `bun run dynamo:init`, `bun run seed`, and `bun run test:dynamo` from `rest-api`. The table initializer creates a two-key on-demand table if absent. The contract test uses `reset`, which clears the entire local table; use a dedicated test table. The memory adapter remains the default and requires no AWS access.

The current document model makes reads and single-trip edits simple. It also means concurrent edits to different activities in one trip conflict. At larger scale, a million-user deployment needs capacity planning and retention policy. The memory adapter has no durability or cross-process coordination. DynamoDB's cursor traversal is not a snapshot, and conditional writes conflict when concurrent edits target the same trip.

Verify with `bun run test` in `rest-api`: the contract tests cover owner isolation, missing records, stable paging, stale writes, domain edits, and the Hono trip route.

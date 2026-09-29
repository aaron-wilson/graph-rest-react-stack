# Typed trip graph over REST

A trip screen asks GraphQL for several trips, their days and activities in one request. Wander's REST service owns those records, so a naive resolver would send one REST request per requested trip, trust whatever came back, and could keep a private trip in a cache shared by another caller. The GraphQL service instead treats REST as a validated, per-caller dependency and batches reads within one request.

The graph is defined once in `graph-api/schema.graphql`. `pnpm codegen` runs GraphQL Code Generator over that file and writes `src/graphql/generated.ts`: TypeScript types, typed resolver signatures, and the SDL string the server loads at runtime. `pnpm codegen:check` fails when the generated file differs from the SDL, and a UI client can copy the same SDL for offline codegen. Queries are `trip(id)`, `trips(first, after)` and the anonymous `sharedTrip(ownerId, tripId, token)`. Mutations are `createTrip`, `refineTrip`, `pinActivity`, `swapActivity` and `shareTrip`. Each mutation takes the trip `version` it last saw and returns the saved trip, so a stale edit fails instead of overwriting newer work. The earlier `planTrip` prototype query is removed; its provider calls now feed trip planning. Resolvers only pass arguments to a trip service, which validates input with Zod, calls weather, places and events providers for activity ideas, and saves through REST. Pinned activities survive `refineTrip`; the selected LLM provider is not used by these synchronous mutations and is reserved for streamed itinerary text.

The REST client is bound to one caller's `Authorization` header. It validates every response with Zod, caps response bodies at 1 MB, applies `REST_TIMEOUT_MS` to each call, and turns upstream failures into a small set of statuses. It never retries: a repeated versioned mutation could apply twice or report a misleading conflict. REST client errors become GraphQL codes (`BAD_USER_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`); REST outages, malformed REST data and provider errors are masked as `INTERNAL_SERVER_ERROR` without upstream text.

Each GraphQL request builds its own trip service and DataLoader after authentication. The loader collects every `trip(id)` read in the same tick and sends one `POST /trips/batch` call with up to 100 IDs, forwarding that caller's bearer token. It also drops any returned trip whose owner differs from the caller, a second check after REST ownership filtering. Because the loader lives in the request context, one user's cached trips cannot answer another user's request, and the cache disappears when the response ends. A mutation replaces the loader entry with the trip REST returned; `shareTrip` clears the entry and reloads it, because the REST share route returns only the link.

For example, this query asks for five trip fields covering four distinct IDs, one of which does not exist:

```graphql
{
  a: trip(id: "…") { id }
  b: trip(id: "…") { id }
  c: trip(id: "…") { id }
  again: trip(id: "…same as a…") { city }
  missing: trip(id: "00000000-0000-4000-8000-00000000abcd") { id }
}
```

The integration test records the REST traffic: exactly one `POST /trips/batch` carrying the four IDs, with `missing` returned as `null`. In a mutation that pins an activity, refines the trip and shares it, REST sees pin, update, share and a single batch reload. The refine step reads the pinned trip from the loader rather than refetching it.

Authentication matches REST. `APP_MODE=demo` accepts only `Authorization: Bearer demo`; `APP_MODE=live` verifies Cognito access tokens for `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`, and startup refuses to combine live mode with demo auth. A missing header is anonymous: only `sharedTrip` works, and other operations return `UNAUTHENTICATED`. An invalid header fails the whole request with HTTP 401. Before execution, a validation rule rejects operations deeper than `MAX_QUERY_DEPTH` (default 8) or costlier than `MAX_QUERY_COMPLEXITY` (default 100). Cost counts each selected field once and multiplies a list field's children by its `first` argument; a variable page size is costed at 100. Introspection and GraphiQL are off unless `ALLOW_INTROSPECTION=true`.

Trade-offs: batching applies within one request only, so repeated page loads still read REST each time; that keeps caches private and never stale across requests. REST limits private requests by verified principal and public or failed-authentication requests by client address. Anonymous share reads from GraphQL arrive at REST from one address and share that address's bucket; a production deployment should rate-limit at the edge. Cost limits are a coarse static estimate, not a measure of REST or provider latency. Refinement uses the trip currently stored for planning but saves with the caller's version, so a caller holding an old version receives a conflict and must reload.

Verify from `graph-api` with installed dependencies. `pnpm test` runs unit and bound-HTTP GraphQL tests without REST or network access. `pnpm test:integration` needs Bun and a sibling `rest-api` checkout with dependencies installed, or `REST_API_DIR` pointing to one. It starts the real REST app on Bun with its routes, validation and memory store, swapping in two fixed test principals, then checks graph shape, auth and ownership, errors, cache refresh and the batch count above. `pnpm codegen:check` confirms the generated file matches the SDL.

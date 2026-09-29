# Planning journey across the static UI and APIs

The static UI uses `/plan/` to start a trip, `/trip/?id=...` to edit a saved trip, and `/share/?token=...` to show a public read-only projection. The two query-based routes are exported once at build time; runtime trip IDs and share links do not need build-time enumeration. Next wraps their search-parameter client boundaries in Suspense.

Creation and refinement start a GraphQL generation, then read authenticated SSE events with a bearer header. The client tracks generation ID and sequence, skips duplicates on reconnect, and resets stream text when a new generation begins. A completion event contains a persisted trip ID, which the UI loads through GraphQL. Connection loss offers reconnect; an interrupted process-local job offers a fresh start. Pin, swap, and share use versioned mutations, so a stale edit returns a conflict instead of overwriting a newer trip. The saved list and day board show loading, empty, and failure states.

A share link stores the REST owner ID, trip ID, and random share token in one URL-safe `token` parameter. The share page decodes it and calls GraphQL's public `sharedTrip`; the server returns only the read-only projection. Anyone with the link can read until it expires or is revoked. The link token is a bearer secret and should not be logged.

Vitest covers form behavior, SSE frame parsing, bearer headers, and link decoding. Playwright starts the actual Bun REST server, Node GraphQL server, and exported static UI, then checks create → stream → pin → swap → refine → share plus accessibility on the primary routes. Chromium is the local default; Firefox and WebKit are explicit projects. Browser binaries are installed separately and are never fetched by the test command.

# Optional browser error monitoring

The static UI initializes Sentry only when a public HTTPS `NEXT_PUBLIC_SENTRY_DSN` is built into the site. Its default blank value performs no SDK initialization or outbound export. A React boundary and the Next route error view show a retry path. Browser performance spans are sampled at 10 percent when enabled.

The event scrubber removes user, request, route, input, itinerary, breadcrumb, and extra context. It keeps exception type and safe stack locations for source maps, replacing message text. A locally generated W3C trace ID sent to GraphQL is added as `backend_trace_id` so an operator can correlate an error with API traces without sending a token or trip ID. Performance spans have their data and descriptions stripped to a generic operation.

Source-map upload is an explicit operator action. Build with `SENTRY_SOURCE_MAPS=true` and matching public `NEXT_PUBLIC_SENTRY_RELEASE`, then supply build-only `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_RELEASE` to `pnpm sentry:upload`. The upload script checks that maps exist, calls the pinned CLI, and removes maps from `out/` only after success. The token is not read by browser code. Never deploy the map files before upload/removal.

In Sentry, create one issue alert for new UI errors, optionally choose a notification destination, and test it with an operator-triggered error. No account, alert, destination, source-map upload, or live event delivery has been configured by this project.

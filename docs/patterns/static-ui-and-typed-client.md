# Static UI and typed GraphQL client

The Wander frontend is a Next App Router site built with `output: "export"`. Next renders its shell at build time and writes plain files to `out/`; the browser calls GraphQL directly. This keeps hosting simple and prevents API routes, server actions, or request-time secrets from entering the UI deployment. Vite appears only in Vitest's component test transforms.

The public GraphQL endpoint is validated from `NEXT_PUBLIC_GRAPHQL_URL`; the static-site origin is a separate build setting. A copied, versioned GraphQL SDL supports offline code generation. The drift check verifies its pinned hash and compares it with the sibling GraphQL checkout when available. Typed operations compile against that copy without a running schema server.

Each authenticated identity gets a fresh urql client and document cache. The client obtains the current bearer token when sending an HTTP request, and a new identity creates a new cache; sign-out can select an anonymous client immediately. The site has light and dark color tokens, keyboard focus styles and reduced-motion rules. The setup panel checks the GraphQL health endpoint without exposing credentials.

Run the UI's typecheck, Vitest, lint, format, codegen check, schema check, and `next build --webpack` from an installed checkout. The Webpack flag avoids a Turbopack/PostCSS helper-port failure observed in restricted local sandboxes. The build needs no account or running API and emits static files only.

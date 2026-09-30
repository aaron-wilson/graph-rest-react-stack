# Static docs and responsive images

Wander's static UI ships a small teaching section without requiring the documentation repo at runtime. The UI build imports two checked-in MDX snapshots from this hub: the planning journey and provider configuration guides. `react-ui/scripts/sync-docs.mjs` copies only those allowlisted files, records SHA-256 hashes and their last source revision, and `docs:check` detects content drift when the sibling hub checkout exists. A standalone UI checkout still builds from its committed snapshot. Repository content is trusted at build time; user-submitted MDX is never compiled.

The `/docs/` page uses Next's MDX loader during static export. A client-side provider selector demonstrates the `PROVIDER_WEATHER` setting without calling any vendor. Headings and code have local styles. This keeps documentation interactive while the deployed site stays static.

The home page's source artwork is an SVG committed in `react-ui/artwork/`. A Sharp script generates 640 and 1280 pixel AVIF and WebP variants in `public/images/`. The `<picture>` element supplies format, width descriptors, `sizes`, intrinsic dimensions, and meaningful alternative text. `images:check` recomputes bytes to catch drift. There is no runtime image service or third-party image request.

Verify with `node scripts/sync-docs.mjs --check`, `node scripts/build-images.mjs --check`, UI tests, and `next build --webpack` from the UI repo. The docs route and image assets are present in `out/` after build. The snapshot must be refreshed after a change to one of its selected source files.

# Native Vue SDK host

Enable embedding in an existing Histoire book and allow `http://127.0.0.1:5174`. Run `pnpm --filter histoire-example-embed-vue dev`, enter its absolute base URL, and connect. `VITE_HISTOIRE_URL` or `?source=` can prefill the URL.

Two caller-owned sessions provide independent tree/search/toolbar/controls/docs/source/events/tests and isolated story previews. `@histoire/controls/vue` also renders a reactive host control inside each provider. Host Vue comes from its peer dependency; no vendor Vue or Histoire Vite aliases enter the host. Import `@histoire/vue/style.css` explicitly. Story/custom-control modules execute only on the source origin.

Select a story in each provider to start its runtime. Switching preview/grid awaits the wrapper's exposed `unmount()` before mounting replacement. Data-only access and selecting docs do not create a hidden runtime. Errors remain visible; no execution fallback or retry occurs.

Provider removes its own child resources and preserves caller session ownership. Host explicitly disposes sessions on reconnect/pagehide. The unrelated host field remains under the host app's control. Persistence is omitted.

Build with `pnpm --filter histoire-example-embed-vue build`. Source may be a dev server or static deployment under a nested base; no external story loader is supported.

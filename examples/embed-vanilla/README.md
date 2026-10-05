# Plain TypeScript SDK host

Start an existing Histoire source with embedding enabled:

```ts
export default {
  embed: { enabled: true, allowedOrigins: ['http://127.0.0.1:5173'] },
}
```

Run `pnpm --filter histoire-example-embed-vanilla dev`, enter the source's absolute base URL, and connect. `VITE_HISTOIRE_URL` or `?source=` can prefill it. Dev sources and deployed static books use the same URL contract; nested paths must retain the trailing slash.

Explorer mounts one primary. Independent parts use two sessions with one preview/grid each. Hidden-preview mode mounts data panels first and creates its runtime only after explicit selection and button activation. Selection stores exact `{ storyId, variantId }` tuples; IDs containing `:` remain intact.

Each session owns its frames. Disconnect/pagehide disposes those resources. Persistence is omitted and therefore disabled. Failed capabilities or connection errors appear directly; reconnect requires another explicit Connect action.

A dev source optimizer reload marks session stale and shows an explicit reconnect error. Click Connect again to create a fresh controller; state changes and test runs are never replayed.

Build with `pnpm --filter histoire-example-embed-vanilla build`. This host imports `@histoire/sdk` and no Vue, app, Node, or story modules. No Histoire Vite aliases are configured.

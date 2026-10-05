# Host-owned HTTP and WebSocket example

```bash
pnpm --filter histoire-example-embed-node build
node examples/embed-node/dist/index.js /absolute/path/to/existing/book [configFile]
```

Project root is required. Relative config paths resolve against that root. `PORT` defaults to `6007`; `PUBLIC_ORIGIN` defaults to its loopback origin and must match the externally visible origin when using a proxy. Existing book dependencies must already be installed.

Caller creates HTTP server, attaches stable middleware at `/stories/`, starts the server, then awaits `ready`. `/api/health` and echo WebSocket `/echo` belong to the host. `POST /api/histoire/close` closes Histoire only; host API and existing WebSockets remain available. CLI signals close both through application-owned cleanup.

Library does not change cwd, install dependencies, listen on caller server, register process handlers, or call `process.exit()`. Unrelated cwd is supported. HMR stays under `/stories/` while host WebSocket upgrades keep their own path. Source's embed configuration controls iframe access; Node hosting does not enable embedding implicitly.

For development: `pnpm --filter histoire-example-embed-node dev /absolute/project/root [configFile]`. Optional browser test dependencies are required only when requesting tests/capture explicitly.

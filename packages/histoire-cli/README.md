# @histoire/cli

Command line for Histoire: Sade command definitions, the `histoire dev` parent process and its interactive terminal.

- `runCli(host)` defines `dev`, `mcp`, `build`, `preview`, `test`, `screenshot-setup` and `visual`. Command implementations and the dev parent's Histoire-specific inputs are injected by `histoire` as lazy loaders, so `--help` and the dev parent never load project, Vite or test graphs. This package never imports `histoire`.
- The dev parent owns the public proxy (`@histoire/dev-proxy`) and the terminal (panel, plain output, views, key handling). It talks to the runtime child over the private terminal protocol.
- Subpath exports: `@histoire/cli/protocol/*` and `@histoire/cli/sanitize` (dependency-light modules also loaded by the child), and `@histoire/cli/workbench-url` (story route helpers; the dev parent loads them only on first use).

Tests: `pnpm --filter @histoire/cli test`. Workspace dependencies (`@histoire/dev-proxy`, `@histoire/protocol`, `@histoire/vendors`) resolve to their built output, so build them first (`pnpm run build` at the root).

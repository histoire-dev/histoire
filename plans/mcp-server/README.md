# Histoire MCP server slice plans

Status: implemented; local validation gates passed. Written 2026-10-02 and implemented by one dedicated agent per slice. This pack preserves architecture, contracts, ownership, and acceptance requirements. [Evidence](evidence.md) records actual completed gates and remaining boundaries. Local commit authorized after validation; remote CI, push, and publication were not performed.

Local validation: workspace build and final core build; 681 unit tests across 125 files; 25 transport/framework tests across 5 files; complete clean installed-package/copied-artifact gate; core TypeScript noEmit; documentation build; frozen-lock check; diff check. Scoped workspace lint passes with zero errors and 35 warnings. Full lint retains one unrelated preexisting error in `plans/embeddable-sdk/public-api.md:50` (`ts/method-signature-style`); that file was preserved.

## Intended outcome

An MCP client can discover Histoire stories and variants, read story docs and raw source, resolve preview URLs, capture a rendered variant, and run existing Histoire browser tests. MCP starts by default with `histoire dev`; local stdio remains available. New Node.js deployment target builds a standalone production server serving the compiled book and MCP.

Confirmed product requirements: MCP enabled by default in dev, plus Node.js deploy mode. Capability scope remains discovery, previews, screenshots, and tests; no source-file write tools. Browser dependencies remain optional. Metadata/content operations do not require Playwright or Vitest at runtime.

## Entry points

```bash
# Starts book and local MCP automatically
histoire dev

# Explicitly disable local MCP
histoire dev --no-mcp

# Build standalone Node.js deployment artifact
histoire build --target node

# Run generated artifact; supply HISTOIRE_MCP_TOKEN through deployment environment
PUBLIC_ORIGIN=https://stories.example.com node .histoire/dist/server.mjs
```

Static build remains default: `histoire build` and `histoire build --target static` produce existing static layout. Node target uses configured `outDir` with `server.mjs`, `public/`, and `private/`. Default dev MCP is loopback-only and needs no credentials; supplying HISTOIRE_MCP_TOKEN enables bearer authentication locally. Deployed MCP requires credentials by default; Node server accepts HOST/PORT/PUBLIC_ORIGIN and serves MCP at `<base>__histoire/mcp` on book's HTTP listener.

## Read first

1. [Architecture and repository seams](architecture.md).
2. [Tool, resource, and lifecycle contracts](contracts.md).
3. [Validation and acceptance matrix](validation.md).
4. Each slice contains file ownership, baseline tests, implementation steps, acceptance gates, non-goals, and implementation evidence. Use the [evidence ledger](evidence.md) for validation status.

## Slices and dependencies

| Slice | Outcome | Depends on |
| --- | --- | --- |
| [01](01-contracts-and-dependencies.md) | Schema, limits, SDK integration, shared test harness | None |
| [02](02-project-runtime-lifecycle.md) | Owned dev runtime, readiness, restart, cleanup | 01 |
| [03](03-catalog-and-collection-diagnostics.md) | Atomic catalog, collection failures, HMR freshness | 02 |
| [04](04-docs-and-source-access.md) | Bounded docs/source reads from catalog allowlist | 03 |
| [05](05-mcp-tools-and-resources.md) | Read tools/resources through official MCP SDK | 01, 03, 04 |
| [06](06-stdio-command-and-worker.md) | `histoire mcp` with clean stdout and owned worker | 02, 05 |
| [07](07-http-dev-endpoint.md) | Default-on dev MCP, explicit disable, loopback-only HTTP | 02, 05 |
| [08](08-operation-queue-and-cancellation.md) | Bounded jobs, exact ownership, shared execution lane | 02, 05 |
| [09](09-preview-screenshots.md) | Preview URL parity and isolated screenshots | 03, 07, 08 |
| [10](10-browser-test-execution.md) | Existing Vitest runner exposed as cancellable jobs | 03, 08 |
| [11](11-node-deploy-build.md) | Node artifact/schema/bundle infrastructure and private catalog/content | 01, 03, 04, 05, 07 |
| [12](12-node-production-server.md) | Production book/MCP server, auth, health, graceful shutdown | 07, 08, 09, 11 |
| [13](13-deployed-preview-test-execution.md) | Tests through compiled preview runtime without project Vitest | 09, 10, 11, 12 |
| [14](14-transport-and-framework-conformance.md) | Real transport/framework/deployment/failure-path proof | 06, 07, 09, 10, 11, 12, 13 |
| [15](15-documentation-and-delivery-gates.md) | User docs, package/deploy smoke, CI, release checklist | 14 |

Slices 06 and 07 can be developed independently after their prerequisites. Slice 08 can be developed alongside transport work. Slice 09's HTTP dependency is for sharing listener validation patterns and E2E infrastructure; screenshot URLs always target the Histoire UI server, never the MCP listener. Slice 10 can proceed once 08 lands. This dependency map describes implementation ownership; it does not authorize launching concurrent agents.

## Milestones

- **Read access:** 01–07. Default dev HTTP and stdio expose project/catalog/docs/source/preview URL tools. No browser is launched for these tools.
- **Execution:** 08–10. Screenshots and tests return operation handles; polling and cancellation work without long-lived protocol calls.
- **Node deployment:** 11–13. Standalone build, production server, and compiled-preview test execution.
- **Acceptance:** 14–15. Installed-package, deployed-artifact, Vue/Svelte, restart, cancellation, and regression evidence recorded separately.

## Global implementation rules

- Preserve unrelated changes. Do not stage, commit, push, publish, or install global software without separate authorization.
- Keep new source/test modules below 300 lines. Split by responsibility before crossing that limit. Documentation is exempt.
- Add JSDoc to exported and internal functions, classes, types, and properties. Comment lifecycle, atomic publication, cancellation, and containment logic.
- Reuse existing Histoire runners, serialization, dependency resolvers, timeout helpers, and test utilities. Introduce one MCP harness, not one per slice.
- Use meaningful behavior tests first. Do not test CSS classes, implementation-only object identities, or duplicated schema implementation details.
- Do not export executable MCP modules through `@histoire/shared` or browser-facing entries.
- Treat these files as implementation instructions, not evidence that any proposed behavior works.

## Explicit non-goals

OAuth authorization-server infrastructure, MCP on static-only hosting, SSR story rendering, arbitrary filesystem access, shell commands, caller-supplied browser JavaScript, DOM click/type automation, source generation/editing, control-state mutation, component prop inference, visual regression baselines, and a new app UI are outside v1. Node hosting behind TLS termination is in scope; managed cloud provisioning is not. Prompts, sampling, elicitation, protocol task extensions, and subscriptions are deferred; revision-aware polling is sufficient for v1.

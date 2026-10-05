# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Component authors and teams developing, inspecting, testing, and documenting UI components through stories and variants.

## Product Purpose

Histoire provides interactive component playgrounds. Users inspect components in isolation, edit preview state, compare variants, read documentation, inspect events and source, and run component tests.

## Operating Context

- `histoire dev` runs a Vite-backed development workbench with live project services.
- Static builds publish a browsable component catalog and documentation without development services.
- Framework plugins supply story collection and preview rendering. Standalone workbench composes the session-driven SDK.
- Story, variant, and documentation navigation preserve existing route and query contracts.

## Capabilities and Constraints

- One catalog supplies story tree, search, Home summaries, and documentation navigation. Counts, titles, targets, build information, and statuses come from project data.
- Canvas supports variant grids, lists, two-axis props matrices, pan, zoom, viewport presets, rotation, backgrounds, and measurement. Preview dimensions come from viewport settings.
- Inspector composes native SDK controls, docs, events, tests, and source services. Canonical selection and runtime state remain SDK-owned; matrix overrides remain local to their cells.
- Project tests, comments, screenshots, MCP activity, ACP agents, and project configuration writes are development capabilities. Static UI hides development panes and commands.
- Optional ACP clients start only after explicit prompts. Project saves require explicit confirmation and retain unsupported computed configuration as a manual snippet.
- Each provider owns local workbench state, theme, focus scope, and cleanup. Preview stories retain their own styles.
- Existing story syntax, framework plugins, preview messages, supported routes, selectors, and storage contracts remain compatible.

## Brand Commitments

Histoire name and existing logo remain. Project title, description, logo, palette, and font overrides remain configurable. Supplied C1 Final boards are binding refresh references; their Acme UI content and counts are sample data.

## Evidence on Hand

- [README](README.md) documents component playground purpose and core workflows.
- [Refresh contracts](plans/ui-redesign/contracts.md) and [architecture](plans/ui-redesign/architecture.md) record supported behavior and ownership.
- [Supplied boards](<plans/ui-redesign/Histoire UI Refresh-png/>) and [design reference](plans/ui-redesign/design-reference.md) establish approved UI authority.
- `examples/` contains executable framework stories and component fixtures. `packages/histoire-app/src/app/` contains current workbench implementation.
- [Implementation validation](plans/ui-redesign/implementation-validation.md) owns verification claims and remaining acceptance limits.

## Product Principles

- Show real project content and attributable state; do not fabricate counts or successful outcomes.
- Compose existing SDK and runtime services instead of creating parallel authorities.
- Keep development services and private project data out of static output.
- Preserve navigation and integration compatibility while changing workbench chrome.
- Keep actions reachable with keyboard and narrow layouts.

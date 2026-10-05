# 06 — Dev and static source adapters

## Outcome and prerequisites

Depends on: 03, 05.

Enabled dev/static books expose data-only bridge and lazy portable catalog/content. Existing book/sandbox artifacts remain compatible. [public-api.md](public-api.md) owns descriptor/config contracts; [coordination.md](coordination.md) owns Node deployment boundary.

## Owned files

- Extend shared configuration types and packages/histoire/src/node/config/defaults.ts with embed settings.
- Add node/virtual/embed/{descriptor,catalog,content,search,source}.ts and register in existing virtual/vite-plugin.ts.
- Extend node/vite/dev-html.ts and node/build/{html,output,vite-config}.ts using canonical providers for HTML/assets/source projection.
- Add packages/histoire-app/src/embed/{index,source,descriptor,subscriptions}.ts and src/bundle-embed.js, src/bundle-embed-dev.js.
- Update app vite.config.ts, copy/watch scripts, and app entry exports for embed assets.
- Add core embed source-output.spec.ts, source-revisions.spec.ts, and static-content.spec.ts; reuse one emitted-source fixture.

## Tests first

1. Default-disabled dev/build exposes neither __embed.html nor histoire-embed.json; old index/sandbox/histoire.json still work.
2. Enabled dev and static descriptor contain same portable projection/capabilities for equivalent project, with deliberate mode differences.
3. Build/serve under nested base. All embed, content, search, CSS, framework runtime, and image assets resolve correctly.
4. Docs/raw-source read lazily with no additional story mounting/import in host. Descriptor does not inline every content body.
5. Story/Markdown/source edits update revision; config restart changes epoch. Failed collection and recovery produce coherent status.
6. Browser projection excludes absolute filesystem paths, config functions, module loaders, private deploy manifests, and credentials.
7. Deploy-time origin override (H9): static book with baked list A and same-base `histoire-embed-origins.json` listing B accepts B and rejects A; Node artifact with `HISTOIRE_EMBED_ORIGINS` likewise; malformed present override allows only the book origin; absent override keeps A. No rebuild between cases.
8. Framing headers (H10): with embed enabled, dev and Node responses for index, __embed.html, __sandbox.html, and an error response carry `frame-ancestors 'self'` plus effective allowed origins; with embed disabled headers are unchanged.

## Implementation steps

1. Validate embed.enabled/allowedOrigins through existing config pipeline. Keep embedding disabled independently of MCP defaults.
2. Define one descriptor/content projection shared by dev/build. Use completed Node provider capture, not parallel story/Markdown reader.
3. Dev serves __embed.html through dedicated route before generic HTML fallback. Document bootstrap chooses data bridge without app/explorer/story mount.
4. Build emits versioned histoire-embed.json, embed HTML/bootstrap, and referenced lazy content/search assets only when enabled. Use source-relative opaque references resolved by source adapter; expose no arbitrary host-specified file/URL read.
5. Add separate app embed bundle entry with source-dev equivalent. Publish/copy required chunks and CSS; existing main/sandbox bootstrap unchanged.
6. Source adapter imports virtual metadata/content modules, not story loaders. Runtime-specific modules load only from explicit preview/custom-controls/test path in later slices.
7. Subscribe dev adapter to existing Vite channel/provider changes. Propagate catalog/content revisions and restart identity through controller notifications.
8. Capabilities reflect implemented views/engines. Static source advertises no server-mode tests, including when static files served by MCP Node deployment.
9. Resolve all assets/routes against configured base and origin. Keep heavyweight bodies lazy; record origin/revision for content sanitization and stale rejection.
10. Integrate with MCP-owned Node build writer only at public browser output seam. If that target absent, document handoff; do not create second deploy implementation or publish private data.
11. Resolve effective allowed origins once per document load: baked descriptor list, replaced by a valid deploy-time override (`histoire-embed-origins.json` for static, `HISTOIRE_EMBED_ORIGINS` for Node routes in deploy/routes.ts). Dev middleware and Node routes add the frame-ancestors header from the same resolver; static docs give the header for host servers. Contract: [public-api.md](public-api.md) "Source documents and cross-origin transport".

## API changes

Add opt-in embed config and source documents defined in public-api.md. No host CORS fetch required: source document reads own-origin data; later bridge returns it over bound port. First-party local adapter shares same DTOs internally.

## Failure paths

Malformed origins/config fail before enabling output. Missing embed document/unsupported source version fails connection explicitly. Broken content reports typed absence/failure; failed collection never masquerades as empty success. Stale adapter notifications ignored by generation. Disabled route must not fall through to successful embed bootstrap.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/shared build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/source-output.spec.ts src/node/__tests__/embed/source-revisions.spec.ts src/node/__tests__/embed/static-content.spec.ts
pnpm run lint
~~~

Inspect/copied static output on plain HTTP server at nested base; Vite dev success alone cannot prove emitted assets.

## Acceptance criteria

- Dev/static descriptor, lazy data, disabled output, nested paths, HMR/restart, and projection safety verified.
- Data access requires no host story imports or automatic preview.
- Static server-tests capability false; Node public/private output boundary preserved.
- Old book/sandbox/artifact behavior retained.

## Non-goals

Cross-origin authorization handshake, remote surface rendering, dynamic source execution, Node deploy server implementation, and host CORS/auth infrastructure.

## Handoff

Provide descriptor writer/adapter entry, lazy asset layout, capability table by source mode, channel/revision events, and enabled/disabled output evidence to slice 07. Record public Node artifact integration seam for concurrent MCP delivery.

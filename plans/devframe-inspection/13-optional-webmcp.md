# 13 — Optional browser WebMCP exposure

## Outcome and prerequisites

Depends on: 08, 09, 10. Feature-detected local browser tools reuse existing attachment service descriptors.

## Owned files

- New `packages/histoire-devframe/src/client/webmcp/{adapter,registration}.ts`.
- Browser-safe descriptor projection shared with node agent registrations; no Node imports.
- Draft API compatibility tests, lifecycle tests, and supported-browser smoke test when runtime exists.

## Tests first

1. Browser without model-context API receives no tools and SDK/Devframe attachment still functions.
2. `webmcp: false` registers nothing even when upstream client defaults might auto-register.
3. Only locally granted capabilities appear; read-only attachment cannot expose highlight; missing component/audit capability returns unavailable.
4. Multiple attachments in one document have unique names and exact routing; disposing one never unregisters another's tools.
5. Abort/dispose/source replacement unregisters owned tools and rejects pending calls; no stale captured session.

## Implementation steps

1. Wrap pinned Devframe WebMCP adapter and feature-detect actual browser model-context API. Keep experimental code isolated from core.
2. Build tools from same strict descriptors as node MCP, but dispatch directly to local attachment through SDK. Do not pretend node principal authentication exists in browser context; local host exposure/grant scopes remain enforced.
3. Define deterministic attachment suffix for wire names, validate maximum length/collisions, and return local tool manifest for consumers. No global ambiguous `current session` dispatcher.
4. Disable upstream automatic client exposure unless this attachment explicitly enables it; avoid registering duplicate tools through both RPC and explicit model-context path.
5. Dispose exact handles/AbortControllers. Unsupported draft shape returns explicit unavailable state without installing polyfill or changing host's model context.

## API changes

`webmcp: true` activates local feature when supported; default false. Return availability in attachment snapshot. Stable node MCP names remain unchanged; local browser names include attachment scope.

## Failure paths

Browser API churn is optional capability failure, not core SDK failure. No claims of browser interoperability from mocked model-context tests alone.

## Validation commands

Adapter registration/lifecycle tests and browser import checks. Record real-browser WebMCP result separately; if no supported runtime, mark experimental runtime acceptance unverified while core milestones remain valid.

## Acceptance criteria

Feature absence and scope/cleanup tests pass. Any advertised browser support has actual evidence with browser/API version; otherwise documented experimental unavailable path only.

## Non-goals and handoff

No mandatory browser support, polyfill, arbitrary page tools, or alternate auth system. Hand off feature matrix and explicit limitation to 14/15.

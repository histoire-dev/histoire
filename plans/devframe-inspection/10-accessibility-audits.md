# 10 — Accessibility audit service

## Outcome and prerequisites

Depends on: 03, 04, 08. Run one bounded axe-core audit service inside exact story document, available through live SDK, isolated Node, and Devframe MCP.

## Owned files

- New browser scanner/normalizer under `packages/histoire-shared/src/inspection/accessibility/` with optional runtime loader.
- Runtime `inspection.accessibility` handler; SDK/API service methods and capability projection.
- Node runtime inspection task extension for isolated audit; new adapter audit descriptor/tool.
- Optional Devframe a11y add-on service adapter, separate from scanner.
- Browser/Node/MCP audit tests and existing story fixture extensions.

## Tests first

1. Broken story element produces violation; identical broken workbench shell element is excluded. Target selected grid cell only.
2. Live state changes alter audit; isolated source uses initial fresh state and labeled mode.
3. Missing axe returns dependency/capability error without disabling DOM/variant inspection. Disabled build contains no axe import/bundle payload.
4. Cancellation/runtime replacement during scan suppresses output and releases audit admission; overlap on same runtime rejects explicitly.
5. Huge violation list remains within byte/node budgets, marks truncation/loss, and omits raw HTML/unsafe URLs.
6. Existing Playwright ARIA tool retains its old shape/semantics and is never represented as axe success.

## Implementation steps

1. Resolve/pin optional axe dependency at feature-owning package. Source opt-in controls lazy instrumentation; no download at scan time.
2. Run scanner inside runtime document with validated selector and fixed supported rule policy. First version uses axe defaults; caller cannot pass executable callbacks or arbitrary axe configuration.
3. Normalize report with engine version, bounded violations/incomplete findings, counts, and exact owner. Preserve rule help URLs only under safe URL policy.
4. Add SDK `inspect.accessibility`, public Node `inspect.accessibility`, and `histoire_audit_session_accessibility`. Native legacy accessibility tool remains ARIA-only; no renamed semantics.
5. Use existing Node browser lane for isolated scan. Live scan uses runtime per-document admission and cooperative cancellation; non-abortable axe completion cannot publish after cancellation.
6. Assess pinned Devframe a11y add-on integration: if it accepts external report/scan service, bind ours; otherwise use Histoire native panel/dock adapter and document why direct add-on reuse is unavailable. Do not create duplicate scanner authority.

## API changes

Audit methods/capability and normalized report defined in [contracts](contracts.md). Automated findings do not establish overall accessibility compliance.

## Failure paths

Invalid selector, no match, missing engine, scan failure, timeout, and cancelled owner stay distinct. No-match result contains `matched: false` and empty report, not a successful whole-document scan. No fallback from requested selector to body.

## Validation commands

Real iframe audit in dev and explicitly instrumented static build, Node audit parity, agent schema/cancellation test, bundle absence probe, existing ARIA regression suite.

## Acceptance criteria

Same owned document produces consistent SDK/MCP report; isolated audit works separately; bounds, cleanup, and shell exclusion proven.

## Non-goals and handoff

No compliance certification, automatic fix generation/application, full-page multi-origin traversal, or unrestricted axe options. Hand off report/highlight integration to 11/12/13.

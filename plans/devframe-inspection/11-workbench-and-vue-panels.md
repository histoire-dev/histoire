# 11 — Workbench and reusable Vue panels

## Outcome and prerequisites

Depends on: 05, 09, 10. Present component inspection, debug timeline, and accessibility findings using shared session APIs.

## Owned files

- New `packages/histoire-vue/src/components/inspection/`, `src/components/debug/`, and `src/components/accessibility/` with small controllers; export `HistoireInspection`, `HistoireDebug`, `HistoireAccessibility`.
- Standalone integration under `packages/histoire-app/src/app/components/inspector/` and canvas picker actions; update inspector tabs/routes with additive values.
- Use existing source/editor action, provider/session composables, geometry/overlay utilities, and `WorkbenchEmptyState`.
- Native Vue behavior tests plus browser workbench tests using existing Cypress helpers.

## Tests first

1. Picking element selects correct component/details and highlights exact story document without selecting another variant or creating runtime.
2. Changing variant during load never publishes prior details; collapsed/disposed panel releases subscriptions.
3. Trace filtering by target/request works across retained prior runtime entries; gaps and unavailable diagnostics explicit.
4. Audit finding highlights corresponding element; unavailable selector/component produces clear recoverable state.
5. Keyboard navigation, focus return, source open policy, and panel composition work in native SDK host as well as standalone.
6. Disabled/unsupported features show appropriate empty/unavailable state; legacy Props/Docs/Events/Tests tab URLs remain valid.

## Implementation steps

1. Build session-backed panel controllers with cancellation and captured owner. Public components consume provider or explicit session according to existing Vue package conventions; no private workbench store dependency.
2. Inspection panel offers component hierarchy, selected details, DOM information, and verified source action. Emit `openComponentSource` only for known relative metadata when host supplies handler; otherwise offer existing `Open story source` action and do not imply it opens component file. Keep copy minimal; show truncation/partial capability only when relevant.
3. Debug panel lists bounded entries, target filter, request correlation, clear, and loss indicator. Do not imply deterministic replay or causality unsupported by entry fields.
4. Accessibility panel offers explicit scan, grouped violations/incomplete findings, highlight, and source when known. No background audit loop.
5. Integrate standalone inspector additively. Respect existing close/persistence, matrix targeting, and inspector tab routing. Shared selected inspection node belongs to panel/session scope, not module singleton.
6. Native empty-state presentation may use equivalent package-safe component; workbench wrapper must use `WorkbenchEmptyState`. Keep first-party English copy free of “preview”.
7. Verify canvas geometry under zoom/scroll/overlays and virtualized grids; runtime-local ring avoids host-coordinate guessing.

## API changes

Three opt-in Vue panels. If adding iframe surfaces, extend `HistoireSurface` with `inspection`, `debug`, and `accessibility` only after matching native surface adapters exist; include them in this slice's tests.

## Failure paths

Unavailable feature does not crash existing inspector. Failed/cancelled read never overwrites successor owner. Source unavailable disables editor action rather than guessing file path.

## Validation commands

Focused `@histoire/vue` behavior tests, affected workbench Cypress specs, real native host check, scoped lint/build. No assertions on decorative classes/styles.

## Acceptance criteria

User can inspect picked Vue instance, read attributed diagnostics, scan and highlight findings in standalone and native host. Keyboard/ownership/cleanup tests pass.

## Non-goals and handoff

No workbench redesign, duplicate state controls, automatic code edits, or dependency on Devframe UI for native panels. Hand off reusable panels and dock composition to 12.

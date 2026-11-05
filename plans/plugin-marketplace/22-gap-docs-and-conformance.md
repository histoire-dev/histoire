# 22 — Gap docs and conformance

Status: **complete**. Dependencies: 14–21. Wave 10 (runs alone). Docs and reconciliation delivered; validation passes or records concrete dist/tooling blockers in [receipt 22](receipts/22.md).

## Goal

Document the gap fixes, reconcile receipts 14–21, and rerun the validation matrix.

## Owned files

- `docs/guide/plugins/marketplace.md`: private/scoped registries and `.npmrc`, dependency repair after failures, offline official history.
- `docs/guide/plugins/development.md`, `docs/reference/plugin-api.md`: `adds[].contribution`, `primaryCommand` on panes and tabs, official history workflow (`marketplace:history`, `marketplace:index`).
- `plans/plugin-marketplace/{README,evidence}.md`, slice statuses 14–22.
- Integration fixes recorded as deviations in receipts 14–21, applied one at a time.

## Implementation steps

1. Reconcile receipts; fix or justify each deviation.
2. Run every command in [validation](validation.md#commands), including the interop command. Record counts.
3. Remove fixed items from the README "Follow-ups and proof gaps" list; keep the rest with reasons.
4. Grep new app copy for "preview" and filler.

## Acceptance criteria

- Matrix passes or concrete blockers are recorded.

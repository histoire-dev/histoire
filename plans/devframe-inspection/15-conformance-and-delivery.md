# 15 — Conformance and delivery gates

## Outcome and prerequisites

Depends on: 14. Review integrated changes and establish evidence for each advertised milestone.

## Owned files

- Implementation evidence and conformance records under this plan directory.
- Existing integration/package suites and `.github/workflows/` only where an actual workflow must invoke new tests.
- Small targeted repairs coordinated with source-slice ownership; avoid unrelated refactors.

## Tests first / final regression scenarios

1. Full M1: start host, pair two sessions, mutate one, discover/call exact live session, compare fresh isolated read, replace runtime during call, and verify stale rejection.
2. Full M2: pick Vue component, inspect props without getter execution, follow correlated error, run axe on story iframe, highlight finding, open permitted source.
3. Full M3: packed custom host, dock host, static report, disabled dependency matrix, cross-origin host, and actual agent transport.
4. Adversarial ownership: revocation between list/call, simultaneous grant redemption, disconnect during result, old callback after successor attachment, close during startup, and failed browser cleanup.
5. Baseline native MCP and SDK suites pass on final integrated tree; distinguish unrelated concurrent failures.

## Implementation steps

1. Review diff and tests for duplicated readers/fixtures, missing JSDoc, oversized modules, ineffective tests, and unbounded serialization. Split by responsibility; remove redundant assertions.
2. Run required [validation matrix](validation.md) with bounded fixtures and actual browser/transports. Reuse upstream compatibility receipts from 01 unless versions changed.
3. Verify read-only capability enforcement in handlers, not only MCP annotations/UI. Inspect actual tools/resources with all features enabled for accidental shared-state exposure.
4. Capture exact tree identity, package/browser versions, commands, results, and limitations. Update evidence only for executed checks.
5. Wire repeatable checks into existing CI architecture when authorized implementation includes CI source changes; local run does not establish remote CI pass.
6. Mark milestone complete only if its gates pass. Optional WebMCP may remain explicitly experimental/unverified; do not advertise supported runtime until tested. A required cross-origin/ownership/package failure blocks relevant milestone.

## API changes

None beyond corrections needed to match frozen contract. Any incompatible discovery requires contract/changelog update and dependent test correction before acceptance.

## Failure paths

Browser installation/network/sandbox failures are environment blockers, not product passes. Cancelled run is neither passing nor failing assertion proof. Cleanup quarantine failures block release acceptance. Never soften an invariant to make an integration test pass.

## Validation commands

Run affected package suites, real embed/MCP/adapter integration, tarball consumers, builds, docs build, scoped lint, and `git diff --check` as recorded in validation document. Broaden once after final repair; avoid redundant full reruns without changes.

## Acceptance criteria

- Same component instance accessible through SDK/UI/live MCP with exact ownership.
- Fresh isolated behavior and all existing wire contracts retained.
- Optional dependencies/feature defaults and principal isolation proven.
- Native panels, a11y, supported host integrations, and packed public imports validated.
- Remaining experimental capabilities accurately labeled.
- Evidence separates plan, unit, browser, package, and CI proof.

## Non-goals and handoff

No commit, push, publish, or deployment without explicit user request. Final handoff states completed milestones, changed package/API paths, executed checks, and unresolved limitations; do not call deployment complete from local results.

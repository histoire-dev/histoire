# 13 — Docs and conformance

Status: **complete**. Dependencies: 01–12. Wave 6 (runs alone). Source/docs acceptance and concrete outstanding validation boundaries recorded in [receipt](receipts/13.md); browser, Cypress, docs build and refreshed-dist checks remain unrun.

## Goal

Document the marketplace for users and plugin authors, close integration gaps recorded in receipts, and run the full validation matrix.

## Owned files

- Docs:
  - `docs/guide/plugins/marketplace.md` (user guide: browse, install, manage, update, static builds, community toggle, what is written to the project)
  - `docs/guide/plugins/development.md` (new section "Publish to the marketplace": `histoire.marketplace` fields, options schema, recommendations, release notes, migrations, the `histoire-plugin` keyword)
  - `docs/reference/plugin-api.md` (manifest reference)
  - Nav entry in `docs/.vitepress/config.*`
  - `docs/guide/ui-settings.md` (Plugins section)
- Integration fixes listed as deviations in the receipts from 02–12. Apply them one at a time; each touches the files named in its receipt.
- Cypress spec `examples/vue3/cypress/e2e/marketplace.cy.js`. It covers open, browse, detail and the manual flow in the static build, and dev install only if the example dev server can use the fixture registry and package manager. Otherwise, record it as unrun.

## Implementation steps

1. Reconcile the receipts: list every deviation and fix or justify each one.
2. Run every command in [validation](validation.md#commands). Record the counts.
3. Walk the mockups in the user's running dev server, if one is available (see the repository guidance on port 6006; never rebuild under watchers). Check each board's flow and dark mode. Record screenshots or note the run as unrun.
4. Check the copy: no "preview" in new user-facing strings (grep the new app files), and no filler.
5. Update the [README](README.md) status and slice statuses.

## Acceptance criteria

- The full matrix has passed, or concrete outstanding blockers are recorded.
- Docs build links are valid (`pnpm --filter docs exec vitepress build` counts only if run; otherwise record it as unrun).

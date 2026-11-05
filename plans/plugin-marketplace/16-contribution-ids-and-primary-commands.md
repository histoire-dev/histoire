# 16 — Contribution ids and primary commands

Status: **complete**. Dependencies: 01–13. Wave 7.

## Goal

Let the post-install tour describe each contribution with its own manifest text and offer its primary action ("Run audit") for panes and inspector tabs, not only toolbar tools.

## Contracts

- **Manifest** (orchestrator pre-applies the shared type): `Add.contribution?: string`, the plugin-local contribution id (`localId`) of the registration it describes. Validated as the same id grammar as contribution ids; unknown ids are harmless (they never match).
- **Plugin kit:** optional `primaryCommand?: string` on `ShellPaneInput` and `InspectorTabInput`, a local command id of the same plugin. The registry qualifies it to `${namespace}:${id}` like other ids and rejects foreign namespaces.

## Owned files

- `packages/histoire-plugin-kit/src/types/{shell,inspector}.ts`, `packages/histoire-plugin-kit/src/host/registry.ts` (qualification/validation of `primaryCommand` only) and their specs.
- `NODE/marketplace/manifest/{schema,validate}.ts` and manifest specs.
- `APP/components/marketplace/spotlight/use-spotlight-targets.ts`
- `packages/histoire-vue/src/__tests__/marketplace-spotlight.spec.ts`
- `packages/histoire-plugin-a11y/package.json` (`adds[].contribution`) and the a11y plugin's pane/tab registration (`primaryCommand`).
- Other official plugin `package.json` `adds[].contribution` values, only where the matching registration id is certain from source.

The orchestrator regenerates `official.json` after the wave (slice 15 owns the generator).

## Implementation steps

1. Write failing specs:
   - Kit: `primaryCommand` is qualified; a foreign or malformed id is rejected with the existing diagnostic path.
   - Manifest: `contribution` accepted when valid, dropped with a diagnostic when malformed.
   - Spotlight: with two rail panes from one plugin, each step shows the description of the `adds` entry whose `contribution` equals the registration's `localId`; without a match, fall back to the current first-of-kind rule only when the plugin has exactly one registration of that kind (otherwise no description).
   - Spotlight: a pane with `primaryCommand` shows the command button labelled by the command contribution's label; running it executes through the existing command path; a missing or unavailable command shows no button.
2. Update `use-spotlight-targets.ts`: match by `localId`, read `primaryCommand` for panes and tabs, keep toolbar `command` logic.
3. Add ids to manifests and `primaryCommand` to the a11y pane/tab (its existing "run audit" command).

## Acceptance criteria

- Specs pass; existing spotlight specs keep passing.
- No guessing from labels; only explicit relations produce actions.

## Exclusions

- Spotlight for already-installed plugins.
- Primary commands on other contribution kinds.

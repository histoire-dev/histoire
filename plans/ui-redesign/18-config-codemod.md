# 18 — Config codemod

## Outcome and prerequisites

Depends on: none (can land any time; slice 19 builds on it).

A Node-side module reads and edits the project's existing `histoire.config.{ts,js}` / `.histoire.{ts,js}` as source code, preserving formatting and comments. It answers, for an allowlisted option path, "where is this set, and can it be edited safely?", and applies minimal edits when it can. When a value is computed (variable, function call, spread, conditional, function-valued option), it refuses with a precise reason instead of guessing. No new config format; config files stay plain TS/JS with functions.

## Owned files

- Add `packages/histoire/src/node/config/codemod/{parse,locate,analyze,edit,create,write,types}.ts`.
- Add dependency `magicast` (recast-based, used by Nuxt/unjs for config codemods) to the `histoire` package only. Verify current API and Babel/TS support before adding; fall back to `recast` + `@babel/parser` directly if magicast can't cover a required case.
- Reuse `resolveConfigFile()` from `packages/histoire/src/node/config/load.ts`; do not change config loading or merge order.
- Test fixtures under `packages/histoire/src/node/__tests__/fixtures/config-codemod/` covering the shapes below.

## Supported config shapes

| Shape | Read | Edit |
| --- | --- | --- |
| `export default defineConfig({ ... })` | yes | yes |
| `export default { ... }` / `module.exports = { ... }` | yes | yes |
| `const config = defineConfig({ ... }); export default config` | yes (follow one local binding) | yes |
| `export default defineConfig(async () => ({ ... }))` / function returning a single object literal | yes | yes, inside the returned literal |
| Key whose value is a local `const` with a literal initializer | yes | yes, edits the initializer in place |
| Spread (`...base`), imported value, call result, conditional, template literal, function value | location only | refused with reason |
| Config file absent | — | created (see below) |

## API

```text
analyzeConfigPath(file, path): Promise<{
  status: 'absent' | 'editable' | 'computed' | 'function-only'
  location?: { line: number, column: number }
  reason?: string // e.g. "responsivePresets comes from an imported value (./presets)"
}>
editConfig(file, patches: { path: string, value: JsonValue | undefined }[]): Promise<{ code: string, changed: string[] }>
createConfig(root, patches): Promise<{ file: string, code: string }>
```

Paths are dot/array paths over the allowlist (`responsivePresets`, `backgroundPresets`, `theme.defaultColorScheme`, `ui.defaultArrange`, `agents.presets[<id>]` without `env`, `agents.permissions`). Values are JSON-serializable only.

## Tests first

1. Round trip: editing one key leaves every other byte unchanged except the edited range (fixtures with comments, trailing commas, single/double quotes, semicolon/no-semicolon styles).
2. Each supported shape in the table edits correctly; each refused shape returns the documented status and a reason naming the construct and its line.
3. Adding a missing key inserts it at the end of the object with the file's indentation and quote style; nested missing objects are created.
4. Removing a key (`value: undefined`) deletes the property and its trailing comma correctly.
5. Arrays of presets are replaced element-wise by `label` when possible to minimize diffs; otherwise replaced whole.
6. Creating a config when none exists writes `histoire.config.ts` (TypeScript project: `tsconfig.json` present) or `histoire.config.js` (ESM per `package.json` `type`, else CJS) with `defineConfig` from `histoire` and only the given keys.
7. Edited output still loads through jiti and resolves to the expected values (integration with `resolveConfig`).
8. Files outside the project root, symlinks escaping the root, and non-config paths are rejected.

## Implementation steps

1. Parse with magicast (`parseModule`), locate the config object through the supported shapes, then walk the allowlisted path; classify each node (literal, object, array, identifier → follow one local `const`, otherwise computed).
2. Generate edits with recast so untouched nodes keep original formatting; never reprint the whole file.
3. Write atomically (temp file + rename) and keep a `.histoire/config-backup/<timestamp>` copy of the previous file for one session.
4. Expose a CLI-free API only; the UI channel (slice 19) is the sole caller.

## Failure paths

Parse errors return `status: 'computed'` with the parser message and location. Concurrent external edits are detected by comparing file hash before write; mismatch aborts with "config changed on disk, reload settings".

## Validation commands

~~~bash
pnpm --filter histoire build
pnpm --filter histoire test
pnpm run lint
~~~

## Acceptance criteria

- Minimal, formatting-preserving edits on every supported shape; safe refusal with clear reasons on everything else.
- Existing config loading behavior unchanged.

## Non-goals

A new config format, converting configs between formats, editing function-valued options, editing Vite config files.

## Handoff

`analyzeConfigPath` / `editConfig` / `createConfig` and the allowlist definition for slice 19.

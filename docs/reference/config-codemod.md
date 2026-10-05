# Config codemod

Project settings use a Node-only codemod for explicit **Save to project** actions. It reads the existing `histoire.config.ts`, `histoire.config.js`, `.histoire.ts`, or `.histoire.js`. Config loading and merge precedence remain unchanged.

```ts
import {
  analyzeConfigPath,
  editConfig,
  writeConfig,
} from 'histoire/dist/node/config/codemod/index.js'

const options = { root: projectRoot }
const analysis = await analyzeConfigPath(file, 'ui.defaultArrange', options)

if (analysis.status === 'editable' || analysis.status === 'absent') {
  const preview = await editConfig(file, [
    { path: 'ui.defaultArrange', value: 'list' },
  ], options)
  // Show preview.code before the user confirms their save.
  await writeConfig(file, preview.code, {
    ...options,
    expectedHash: preview.hash,
  })
}
```

`analyzeConfigPath()` reports `absent`, `editable`, `computed`, or `function-only`. Existing settings include a one-based `{ line, column }` location. Refusals identify the construct and source line. Syntax errors return `computed` with the parser message and location.

Editable paths are `responsivePresets`, `backgroundPresets`, `theme.defaultColorScheme`, `ui.defaultArrange`, `agents.presets`, and `agents.permissions`. Agent presets can also be selected by stable ID, such as `agents.presets[helper].command`, with optional `id`, `name`, `command`, `args`, `cwd`, or `default` fields. Keyed edits must preserve the selected preset ID; changing or removing that ID is refused before writing. Replace the full `agents.presets` collection to change identities, keeping IDs unique. Agent `env` values are rejected recursively. Values must be plain JSON; `undefined` removes a setting. Unknown paths, prototype keys, sparse arrays, functions, cycles, and non-finite numbers are rejected.

Supported exports are object literals, `defineConfig({ … })`, `module.exports = { … }`, one local `const` config binding, and config factories returning a single object literal without control flow. A setting can follow one local `const` with a literal initializer; editing updates that initializer. Imports, mutable bindings, alias chains, calls, conditionals, template literals, functions, spreads, computed keys, and duplicate keys are refused when they affect the selected setting.

Parsing uses magicast's Babel/TypeScript parser. Recast generates replacement literals. Source-range edits retain untouched bytes, including comments, mixed quotes, tab indentation, CRLF, and semicolon style. Preset arrays with matching labels or IDs in unchanged order update their fields in place. Changes to array membership/order replace that array literal.

`editConfig()` returns `{ code, changed, hash }` without writing. `hash` describes original disk bytes. `createConfig(root, patches)` returns `{ file, code }` without writing: TypeScript projects receive `histoire.config.ts`; otherwise package `type: "module"` selects ESM JavaScript, with CJS as the default. Generated source imports `defineConfig` from `histoire` and includes only requested settings. Use `writeConfig()` with `expectedHash: undefined` to create the file.

Pass the project root to every file API. Access rejects non-config filenames, paths outside that root, and symlinks escaping it. `writeConfig()` serializes saves per file, checks the expected hash before and after temporary-file IO, preserves file permissions, and atomically replaces the file. A conflict throws `config changed on disk, reload settings`.

Each changed file receives a private backup under `.histoire/config-backup/<timestamp>-<unique-id>`. `writeConfig()` returns its path. If config loading fails, `restoreConfigBackup(file, backup, { root, expectedHash: saved.hash })` restores only a backup from this session while protecting later external edits. `cleanupConfigBackups(root)` removes only backups allocated by this runtime; call it when the dev session closes. `configFileHash()` reads the current hash, returning `undefined` for an absent file.

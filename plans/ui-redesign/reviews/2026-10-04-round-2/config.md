# Config backend review, round 2

Read-only review of UI redesign slices 18–19: codemod analysis/edit/write/path confinement, watcher restart, bounded save receipts/recovery. Current contracts, architecture, slice plans and historical review closures 23–27 read. Historical findings are context; findings below are new boundaries.

## Verified findings

### 1. [P2] Shared literal initializer changes another saved field

Source: `/home/akryum/Projects/histoire/packages/histoire/src/node/config/codemod/update.ts:38–42`, initializer replacement at `:59–60`. Inline anchor: line 42.

Trigger:

```ts
const permission = 'ask'
export default {
  agents: { permissions: { fileEdits: permission, terminal: permission } },
}
```

Save `agents.permissions = { fileEdits: 'ask', terminal: 'never' }`. Analysis classifies editable. Each field is compared with original value independently; terminal replacement edits shared initializer. Returned source loads through actual `loadConfigFile` as `{ fileEdits: 'never', terminal: 'never' }`, changing fileEdits contrary to patch. Saving both fields as `never` instead produces two identical edits to same initializer and throws exact `Overlapping config source edits`.

Proof: `/tmp/histoire-ui-review-round-2/config/verified.spec.ts`, tests `does not change retained permission through another aliased permission` and `deduplicates identical updates to one shared local initializer`; output `/tmp/histoire-ui-review-round-2/config/verified.log`. This proves returned code has wrong effective values; whole runtime/browser save was not acquired for this case.

Fix boundary: track alias/reference ownership before editing an initializer. Deduplicate identical source-range replacements; differing retained expectations must use safe reference-specific edits or refuse before returning/writing source. Validate final supported literal paths against requested patch before publication. Regression must assert effective loaded values, including unchanged sibling alias and identical updates through shared alias.

### 2. [P2] Initial watcher scan loses config transitions

Source: `/home/akryum/Projects/histoire/packages/histoire/src/node/runtime/config-watchers.ts:36–42`; ready at `:69–72`. Inline anchor: line 42. Related generation acquisition/watch boundary: `/home/akryum/Projects/histoire/packages/histoire/src/node/runtime/controller.ts:66–87`.

Trigger: config changes after initial byte snapshot but during chokidar initial scan. `ignoreInitial: true` ignores file's new initial contents; after `ready`, watcher never reconciles captured snapshot. Actual chokidar probe calls real `watch`, synchronously changes config before scan completes, waits for ready and another 150 ms: restart count remains 0. File says list while previous runtime still uses grid.

Second probe uses actual controller and watcher with injected minimal generation acquisition: acquired config is grid; `onGeneration` changes file to list before watcher installs. Controller publishes ready grid, snapshots list as baseline, and never restarts. This establishes acquisition-to-watch gap without full Vite runtime acquisition.

Proof: `/tmp/histoire-ui-review-round-2/config/verified.spec.ts`, tests `notices file changed during initial actual chokidar scan` and `does not start stale effective config when file changes after generation acquisition`; output `/tmp/histoire-ui-review-round-2/config/verified.log`. Every actual watcher/controller closed in finally.

Fix boundary: establish watched revision as part of config acquisition and reconcile after watcher ready before publishing ready generation. Merely refreshing watcher snapshot after ready handles scan window but misses changes between config load and watcher snapshot. Reuse serialized byte-change lane so duplicate events still coalesce. Regression must cover both initial scan and post-acquisition transition.

### 3. [P3] Local literal factory binding wrongly reported imported

Source: `/home/akryum/Projects/histoire/packages/histoire/src/node/config/codemod/locate.ts:10–12`. Inline anchor: line 11.

Trigger: `import { scheme } from './settings'; export default defineConfig(() => { const scheme = 'light'; return { theme: { defaultColorScheme: scheme } } })`. Inner local const is supported factory-local literal binding, but `resolveLocalNode` checks program import map before visible binding map. Analysis reports computed/imported, blocks supported edit and points to unrelated import.

Proof: `uses literal factory binding that shadows an import` in independent probe fails expected editable status. AST path review confirms local binding collected before analysis but discarded by import-first lookup. Source was not changed.

Fix boundary: resolve nearest lexical binding first; treat import only when no nearer binding shadows it. Keep destructured/parameter refusal. Regression must exercise literal shadow of import alongside existing destructured/parameter shadow refusal. This is codemod supported-shape classification proof; no claim that baseline config loader executes factories.

### 4. [P3] Allowed preset-id rename cannot complete verified receipt

Source: `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/config-receipts.ts:95–110`. Inline anchor: line 110. Path `agents.presets[one].id` explicitly accepted by `codemod/paths.ts` and config-save validation.

Trigger: existing literal preset id `one`; send UUID-correlated save `agents.presets[one].id = 'renamed'`. Actual config channel writes changed id and `loadConfigFile` returns it. Successor context gets those effective values. Recovery still selects old id `one`; lookup returns undefined and reports `completion: 'failed'` / `Saved config is not effective in this runtime. Reload settings.` despite effective save.

Proof: `acknowledges allowed preset id rename after effective successor loads` drives registered actual config handler, writer/load and successor read in isolated project. Final on-disk source contains `id: "renamed"`; expected saved acknowledgment fails. Both channel cleanups run. No browser transport/runtime restart acquired. Current Settings saves whole preset collection; scope of finding is accepted keyed-path API.

Fix boundary: either prohibit identity-changing keyed patches before write, or retain post-edit selector in receipt and correlate completion with renamed identity. Whole-item keyed replacement changing id needs same rule; duplicate ids should be rejected in prospective final collection. Regression must prove explicit completion after supported rename or explicit pre-write refusal with original bytes preserved.

## Executed validation

PATH prefix:

```text
/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.local/share/pnpm/.tools/pnpm/10.33.0/bin
```

Existing focused suites:

```sh
pnpm --filter histoire exec vitest run \
  src/node/__tests__/config-codemod.spec.ts \
  src/node/__tests__/config-codemod-preservation.spec.ts \
  src/node/__tests__/config-codemod-write.spec.ts \
  src/node/__tests__/config-watchers.spec.ts \
  src/node/__tests__/config-save-recovery.spec.ts \
  src/node/__tests__/ui-config-channel.spec.ts \
  src/node/__tests__/project-config-recovery-client.spec.ts \
  --maxWorkers=2
```

Result: 7 files, 71 tests passed. Initial command also supplied `--minWorkers=1`; Vitest 4.1.10 rejected option before collecting tests. Corrected command above passed.

Independent expected-behavior regressions:

```sh
pnpm --filter histoire exec vitest run \
  --config /tmp/histoire-ui-review-round-2/config/vitest.config.mjs \
  --maxWorkers=2
```

Result: 1 file, 8 tests; 6 expected-behavior assertions fail, covering four findings; 2 controls pass (shorthand const initializer, mixed tabs/CRLF/Unicode source replacement). Runner exit 1 expected for reproduction. Full output: `/tmp/histoire-ui-review-round-2/config/verified.log`. Temporary config limits discovery to `verified.spec.ts`; exploratory hypotheses retained in `exploration.ts` and `probe.spec.ts` are not acceptance tests.

## Limits and discarded hypotheses

No source/repository-document edits, builds, typechecks, browser/Cypress, root server changes, commits or Git operations. Only owned `/tmp/histoire-ui-review-round-2/config*` artifacts written. Actual scratch projects/watchers/channel cleanups removed/closed. Existing suites use their owned isolated projects.

Receipt removal probe intentionally not promoted: effective fallback value after deletion may legitimately match prior value through defaults/Vite/plugin merge, so checking undefined would be wrong. Duplicate agent-id edit was demonstrated in exploration but folded into narrow rename fix boundary rather than reported as separate finding. Direct unsupported computed values/spreads/calls remain intentional refusal. Program import shadow finding applies supported AST editing contract; baseline executable factory behavior remains outside this review claim.

Post-ready watcher behavior, conflicts, backups/rollback, allowlists/env rejection and existing intended-restart recovery passed focused coverage; this does not establish whole runtime/browser behavior or eliminate timing races beyond executed probes.

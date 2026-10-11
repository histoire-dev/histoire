# Visual testing

Histoire can capture story variants, compare approved PNGs, and review changes locally or in CI. Enable it in your project config:

```ts
export default defineConfig({
  visual: {},
})
```

Every renderable variant becomes a visual case. Default profile is `desktop-light`: 1024 × 640 CSS pixels, scale 1, light theme, white background, left-to-right text. Docs-only stories are excluded. Visual testing needs a Playwright Chromium installation available to the project.

```bash
pnpm add -D playwright
pnpm exec playwright install chromium
```

## Capture profiles

Profiles define reproducible rendering independently from workbench theme, zoom, pan, edited props, and viewport preferences.

```ts
export default defineConfig({
  visual: {
    baselineDir: '.histoire-visual',
    baselineRef: 'main',
    profiles: [
      { id: 'desktop-light', width: 1024, height: 640, colorScheme: 'light' },
      { id: 'desktop-dark', width: 1024, height: 640, colorScheme: 'dark' },
    ],
    exclude: ['**/Unstable.story.vue'],
    threshold: 0.1,
    maxDiffPixelRatio: 0,
    includeAA: false,
  },
})
```

Each profile supports `deviceScaleFactor` (1–3), `backgroundColor`, `textDirection`, and scalar `globals`. Explicit globals replace project globals; omitted globals inherit them. Profiles require unique IDs and explicit light/dark themes. Empty profile arrays and invalid viewport sizes fail configuration processing.

`threshold` controls per-pixel color sensitivity. `maxDiffPixelRatio` is allowed fraction of differing pixels, between 0 and 1. Default accepts zero differing pixels after anti-aliasing detection. Different dimensions or changed capture specifications require explicit baseline replacement, rather than resizing or silently passing.

Captures wait for selected variant, fonts, and two equal consecutive images. Animations/transitions are disabled, motion reduced, locale fixed to en-US, and timezone fixed to UTC. Story authors must provide stable dates, random values, network data, and loading states. Histoire does not rewrite application clocks or responses.

## Workbench review

Open Tests and choose **Visual**. Select profile and baseline source, then **Run**. **Run** captures only comparisons that need it: never captured, stale (source, case, profile, baseline, or comparison policy changed), errored, or cancelled. Valid passing and awaiting-review results are reused. Open the menu next to **Run** and choose **Run all** to capture every selected comparison again. **Changes** includes missing baselines, changed images, incompatible captures, and errors. **All** also includes passing results.

Select result to open wide image review. Compare baseline/current side by side, inspect diff, or use opacity overlay. Images share zoom and pan when dimensions match. **Create baseline** or **Approve baseline** writes exact captured image, without recapturing. Check specific results for bulk approval; failures remain selected.

Approval shows **Saving baseline** immediately, then **Approved** after baseline and recovery evidence are saved. Bulk results update individually as each save finishes. Offline reports rebuild separately; pending report updates survive server restarts. Report failures do not undo saved baselines. Node API and CLI wait for report publication before returning.

Frame menu **Compare to main** reads approved images from configured Git ref. It resolves ref once to commit SHA. No branch checkout, fetch, or build occurs. Fetch or create missing ref yourself. Approval always writes working-tree baselines, including when comparison used committed images.

Source, case definitions, and baseline changes invalidate affected captures. Reconnecting restores review access after validation; stale evidence requires **Run again** before approval.

## Matrix cases

Matrix inspector **Add visual case** saves selected cell. Matrix axis bar **Add visual cases** saves displayed, filtered cells. Complete props, including shared base values and JSON objects/arrays, are persisted in tracked case definitions. Same target/props deduplicates regardless of object-key order. CI replays saved props without depending on browser-local Matrix preferences.

Remove saved case from visual results using **Remove saved case**. Removing definition preserves existing baseline files. No automatic baseline pruning occurs.

## Results across restarts

Each finished case/profile comparison saves immediately in ignored `.histoire/visual/`, including its PNGs and source fingerprints. Workbench restores latest results automatically when dev catalog becomes ready, without taking screenshots. Finished comparisons survive interrupted runs; unfinished jobs never appear as passing.

**Run again** on a result row or in image viewer captures only that case/profile against its original baseline source. Other variants remain visible. **Run** recaptures only missing, stale, or errored comparisons; **Run all** always captures all selected cases freshly. Profile and baseline selectors switch displayed cached results without starting captures.

Restored results can be approved after checking current source dependencies, case/profile, retained PNG digests, and working-baseline revision. Changed or unverifiable inputs mark affected results **Stale**: images remain reviewable, but approval requires rerunning that case. Git comparisons retain original commit SHA; a moved or unavailable ref also requires rerunning. Results depending on external resources cannot be approved after recovery without a fresh comparison.

Deleting `.histoire/visual/` clears temporary results, reports, and locks. Stop active visual operations first. Saved Matrix definitions and approved baselines remain in `.histoire-visual/` (or configured baseline directory). No automatic cache pruning occurs.

## CLI and CI

```bash
histoire visual
histoire visual --baseline-ref main
histoire visual --incremental
histoire visual --story button --variant primary
histoire visual --case <case-id> --profile desktop-light
histoire visual --update --case <case-id>
histoire visual --update --all
```

Filters are exact IDs and combine by intersection. `--variant` requires `--story`. Unknown IDs and empty selections fail. `--update` requires explicit case/story/profile filter or `--all`. `--incremental` captures only comparisons without valid results in `.histoire/visual/`, like workbench **Run**; reused results awaiting review still fail the command.

CLI starts an ephemeral loopback dev server with MCP and agent services disabled, awaits catalog readiness, and uses same capture/comparison lane as workbench. It shuts down owned resources afterward. Static-book execution is unsupported.

Exit codes: `0` for passing or explicitly approved captures, `1` for comparison/capture failures, `2` for setup/config/ref/filter failure, `130` for interruption. Ordinary runs never change approved baselines. Update does not stage, commit, or push files.

Commit `.histoire-visual/cases`, baseline metadata, and referenced images after review. Reports stay ignored in `.histoire/visual/runs/<run-id>/`; command prints JSON and HTML paths. An `--incremental` run that captures nothing writes no report. Upload entire run directory, including `images`, using an always-running CI artifact step. HTML review works offline and is read-only.

Baselines are separated by OS/architecture, such as `linux-x64`. macOS approval does not replace Linux CI baseline. Use same OS distribution, fonts, Playwright lockfile, and Chromium build when creating and comparing CI baselines. Chromium version differences appear as warnings. Browser upgrades can require reviewed baseline updates.

Set `browser: { source: 'headless-shell' }` to use Playwright's pinned headless Chromium consistently. Repository's adoption job uses Ubuntu 24.04, locked Playwright 1.59.1, and deterministic SVG fixtures. Recreate Linux baselines in that environment when upgrading browser. Ordinary CI compares tracked baselines and never approves them.

Write conflicts fail without overwriting another writer's metadata. An abandoned lock under `.histoire/visual/locks` requires removing exact lock only after confirming writer process has exited.

## Node API

```ts
const project = await createHistoireProject({ root: projectRoot })
try {
  const server = await project.startDev({ port: 0, mcp: false, agents: false })
  await server.ready
  const cases = await project.visual.listCases()
  const run = await project.visual.run({ caseId: cases[0].id })
  // After reviewing retained result:
  await project.visual.approve({ runId: run.id, resultIds: [run.results[0].id] })
}
finally {
  await project.close()
}
```

`run` accepts `storyId`, `variantId`, `caseId`, `profileId`, `baselineRef`, and `signal`. Results are detached, immutable observations. Approval requires same live project/source and successful completed capture; retained report alone does not authorize writes after runtime retirement.

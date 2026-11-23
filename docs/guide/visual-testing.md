# Visual testing <Badge type="tip" text="1.0-beta.2+" />

Use visual tests to capture story variants and compare them with approved images locally or in CI. Enable visual testing in your Histoire config.

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  visual: {},
})
```

Each renderable variant becomes a visual case. The default `desktop-light` profile uses 1024 × 640 CSS pixels at 1× scale, with a light theme, white background, and left-to-right text. Install Playwright and Chromium in the project before running comparisons.

```bash
pnpm add -D playwright
pnpm exec playwright install chromium
```

## Capture profiles

Profiles define reproducible rendering independently from workbench theme, zoom, pan, edited props, and viewport preferences.

```ts
import { defineConfig } from 'histoire'

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

Give each profile a unique ID. Set `colorScheme` to `light` (the default) or `dark`. You can also set `deviceScaleFactor` (1–3), `backgroundColor`, `textDirection`, and scalar `globals`. Set `globals` to replace the project defaults, or omit it to inherit them. Use at least one profile and valid viewport sizes.

`threshold` controls per-pixel color sensitivity. `maxDiffPixelRatio` sets the allowed fraction of differing pixels, from 0 to 1. By default, Histoire accepts zero differences after anti-aliasing detection.

If the capture specification changes and the pixels still match, the comparison passes. Histoire can refresh the working-tree baseline to match the new specification, including its PNG. A changed specification with different pixels or dimensions requires a new approved baseline.

Captures wait for selected variant, fonts, and two equal consecutive images. Animations/transitions are disabled, motion reduced, locale fixed to en-US, and timezone fixed to UTC. Story authors must provide stable dates, random values, network data, and loading states. Histoire does not rewrite application clocks or responses.

## Workbench review

Open Tests and choose **Visual**. Select profile and baseline source, then **Run**. **Run** captures only comparisons that need it: never captured, stale (source, case, profile, baseline, or comparison policy changed), errored, or cancelled. Valid passing and awaiting-review results are reused. Open the menu next to **Run** and choose **Run all** to capture every selected comparison again. **Changes** includes missing baselines, changed images, incompatible captures, and errors. **All** also includes passing results.

Select a result to compare the baseline and current capture side by side, view the diff, or use the opacity overlay. Images with matching dimensions share zoom and pan. **Create baseline** and **Approve baseline** use the captured image. Select multiple results to approve them together. Failed saves stay selected.

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

The CLI exits with `0` for passing or explicitly approved captures, `1` for comparison or capture failures, `2` for setup, config, ref, or filter errors, and `130` for interruption. A comparison with `--baseline-ref` reads committed baselines without the automatic working-tree refresh. `--update` writes approved baselines to the working tree. Review and commit those files separately.

Commit `.histoire-visual/cases`, baseline metadata, and referenced images after review. Reports stay ignored in `.histoire/visual/runs/<run-id>/`; command prints JSON and HTML paths. An `--incremental` run that captures nothing writes no report. Upload entire run directory, including `images`, using an always-running CI artifact step. HTML review works offline and is read-only.

Baselines are separated by OS/architecture, such as `linux-x64`. macOS approval does not replace Linux CI baseline. Use same OS distribution, fonts, Playwright lockfile, and Chromium build when creating and comparing CI baselines. Chromium version differences appear as warnings. Browser upgrades can require reviewed baseline updates.

Set `browser: { source: 'headless-shell' }` to use Playwright's pinned headless Chromium. When upgrading the browser, recreate baselines in the same environment your CI uses. In comparison-only CI, pass `--baseline-ref <ref>` to compare with committed images without refreshing working-tree baselines.

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

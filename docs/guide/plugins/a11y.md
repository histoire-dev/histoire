# Accessibility plugin

`@histoire/plugin-a11y` adds axe-core audits to Histoire’s **Accessibility** inspector tab. Works with Vue, React, Svelte, and vanilla stories in development and static books. No remote inspection configuration required.

```sh
pnpm add -D @histoire/plugin-a11y
```

```ts
import { HstA11y } from '@histoire/plugin-a11y'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstVue(), HstA11y({ test: true })],
})
```

## Inspector

Select a variant and open **Accessibility**. Auto-run checks current rendered content and debounces DOM/state changes while tab stays open. Close tab to stop automatic work. Disable **Auto-run** for manual checks with **Run**.

Expand a rule to read affected selectors, failure details, and rule guidance. **Highlight** locates affected element without changing focus. Violations and checks needing manual review stay separate. Outcome, severity, and auto-run preferences persist per project; they never change CI policy.

Each canvas frame header shows its violation count, colored by the worst impact: from the frame's live check when the inspector ran one, otherwise from the latest project results (see below).

Old results remain available during reruns or recoverable failures, marked outdated. Truncated results show omitted-detail count. Automated checks do not establish accessibility compliance; test interaction states and perform manual checks too.

## Project pane

The **Accessibility** rail pane lists findings across every story and variant, worst impact first. Filters are shared with the inspector tab. **Open variant** selects the variant and opens its inspector tab for live checks. **Highlight** on an element does the same, checks the variant live when its result is missing or outdated, then highlights the matching element; it reports when the element changed since the run.

- Development: requires `test: true`. **Run all** runs project tests on the dev server, the same run as the Tests pane **Run all**, and the pane reads the accessibility results of each variant. Results from Tests pane runs show up too.
- Static books: requires `build: true`. `histoire build` checks every variant in headless Chromium and embeds `a11y-report.json` into the book; the pane shows it read-only with the build time. Needs `playwright` with Chromium installed (`npx playwright install chromium`). A check that fails is reported for its variant without failing the build.

## Options

```ts
HstA11y({
  enabled: true,
  devOnly: false,
  autoRun: true,
  timeoutMs: 10000,
  exclude: ['[data-a11y-ignore]'],
  axe: {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  },
  test: { minimumImpact: 'serious' },
  build: true,
})
```

- `enabled`: defaults to `true`; false disables UI and automatic tests.
- `devOnly`: defaults to `false`; true omits UI/scanner from static books. Does not disable opted-in tests.
- `autoRun`: defaults to `true`; initial user preference for live checks while tab open.
- `timeoutMs`: defaults to `10000`, range `1–30000`; includes waiting for another audit in same document.
- `exclude`: defaults to `[]`; selectors resolve only within variant root. Excluding root checks no content.
- `axe`: `runOnly` and `rules` from axe-core `RunOptions`. Omitted uses axe defaults. Selection precedence follows axe; explicitly selected `runOnly` rules take precedence over per-rule disabled overrides.
- `test`: defaults to `false`. `true` or object registers accessibility test per variant. Optional `minimumImpact` accepts `minor`, `moderate`, `serious`, or `critical`. Unknown impact always fails.
- `build`: defaults to `false`. `true` checks every variant during `histoire build` and embeds the report for the project pane. Ignored with `devOnly`.

Scanner uses bundled axe-core **4.14.0**, loaded lazily and locally. No CDN, network service, or runtime dependency installation. Story-owned `window.axe` stays unchanged. Reports exclude raw HTML and are bounded; unsupported nested selector paths are omitted rather than resolved against wrong elements.

## `histoire test`

Enable `test: true`, install project’s [Vitest browser prerequisites](https://histoire.dev/guide/testing.html), then run:

```sh
pnpm histoire test
```

Each variant receives independent **Accessibility (axe-core)** test on fresh rendered mount, including variants without authored tests. All violations fail by default; incomplete checks remain informational. Failure includes rule IDs, severities, affected selectors, and guidance links. Severity threshold changes failure policy, not which rules run.

Automatic tests also appear in development test UI. Discovery registers definitions without scanning. Existing runner owns filtering, reporting, concurrency, cleanup, and exit status. Installing plugin supplies axe, not Vitest or browser binaries.

For interaction states, use explicit assertion inside existing `onTest` registration:

```ts
import { assertA11y } from '@histoire/plugin-a11y/test'
import { onTest } from 'histoire/client'
import { it } from 'vitest'

onTest(({ canvas }) => {
  it('keeps open menu accessible', async () => {
    canvas.querySelector<HTMLButtonElement>('button')!.click()
    await assertA11y(canvas)
  })
})
```

Wait for interaction’s rendered state before asserting. `assertA11y(canvas, options?, context?)` accepts `axe`, `exclude`, `timeoutMs`, and `minimumImpact`; it does not read workbench preferences. Complete axe output determines failure before diagnostics are bounded. Pass the test context (`it('…', async (context) => …)`) to attach findings to the test result; the project pane only lists the automatic **Accessibility (axe-core)** test.

## Embedded hosts

Import default workbench definition from `@histoire/plugin-a11y/client` into caller-owned extension host. Source book must install `HstA11y()` so `@histoire/plugin-a11y/frame` runs inside its story documents. Configure host plugin options to match source settings. Vue views use workbench runtime; native hosts render through their existing Vue integration.

Public entries ship precompiled ESM and declarations. No Vue compiler or manual stylesheet import required.

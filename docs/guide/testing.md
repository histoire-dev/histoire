# Browser tests and runtime migration <Badge type="tip" text="1.0-beta.2+" />

Histoire renders every story inside browser iframe runtime. Same runtime collects and runs story tests, supports Vitest mocks, and owns live variant state.

## Install Vitest browser runtime

Install current stable Vitest packages in project:

```bash
pnpm add -D vitest@latest @vitest/browser-playwright@latest playwright
```

Keep `vitest` and `@vitest/browser-playwright` on same version. Histoire uses project installation instead of bundling separate Vitest copy.

This remains required for development story tests even when the screenshot setup uses an already installed Chrome/Edge or the optional `playwright-core` driver. Screenshot browser discovery does not configure or replace the project Vitest browser runner; see [screenshot setup](./ui-screenshots-mcp.md) for that separate path.

## Register story tests

Use `onTest` inside story and import test APIs from `vitest`:

```ts
import { onTest } from 'histoire/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

onTest(({ canvas }) => {
  describe('button', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders label', () => {
      expect(canvas.textContent).toContain('Save')
    })
  })
})
```

Run once:

```bash
pnpm histoire test
```

Histoire supports `describe`/`suite`, `it`/`test`, `.only`, `.skip`, `.todo`, standard before/after lifecycle hooks, `onTestFinished`, and `onTestFailed`. Benchmarks are ignored. Each case gets a fresh story mount in both `histoire test` and in-book runs; suite hooks therefore surround each isolated mount rather than sharing mutable mounted state between cases. Set [`test.maxWorkers`](../reference/config.md#test-maxworkers) to limit concurrent cases; default uses half the CPUs, fewer when memory is short.

Low-level Vitest runner classes, snapshot assertions, artifacts, and fake timers are not available inside embedded story runner. Unsupported calls fail with explicit error instead of silently passing. Keep tests needing those APIs in regular Vitest spec files.

## State ownership

Preview iframe owns canonical live state. Host UI keeps serializable mirror for generic controls, URLs, and presets. Host boot snapshot never overwrites newly mounted runtime.

Custom `#controls` content also runs in sandbox iframe, so it receives same story environment and Vitest mock support. Primary preview remains canonical; host relays serializable edits between preview and controls replica.

Functions, class instances, Maps, DOM nodes, and other non-serializable values remain usable inside iframe that created them. They cannot preserve identity across preview, controls replica, and host. Keep such logic inside story/custom controls runtime and synchronize serializable fields when cross-frame coordination is needed.

## Migrating from integrated rendering

Remove `iframe: false` from story layouts. Option is deprecated and ignored:

```diff
- :layout="{ type: 'single', iframe: false }"
+ :layout="{ type: 'single' }"
```

Code that accessed host document or host app globals must use story iframe document instead. In a test, use provided `canvas`; in story code, use runtime-local `window` and `document`.

Increase [`test.storyCollectTimeout`](../reference/config.md#test-storycollecttimeout) for legitimately slow imports or mounts. Same budget protects bootstrap and render readiness.

See [Visual testing](./visual-testing.md) for tracked baselines, Matrix cases, image review, and CI comparisons.

## Terminal tests <Badge type="tip" text="1.0-beta.2+" />

Press `t` in the [dev console](./getting-started.md#dev-console) to run browser tests without leaving the terminal. Tests use the same isolated runner and queue as the workbench and `histoire test`; they need the [Vitest browser packages](#install-vitest-browser-runtime) installed in the project. Histoire never installs them. When they are missing, the console shows the same actionable error as other test entry points.

Left and right select the scope: all stories, the selected story, or the selected variant. Story and variant scopes are available after you pick a target in the stories view (`p`, then `t`, which also runs it) and become unresolved after a restart until the catalog confirms the target.

| Key | Action |
| --- | --- |
| `r` | Run the scope |
| `s` | Stop running tests and disable watch |
| `f` | Show failures only |
| `w` | Toggle watch |
| `Enter` | Case detail |
| `[` / `]` | Step through retained runs |
| `/`, `y`, `Y` | Search, copy selected, copy filtered |

Failed assertions give a completed result with failure counts; they do not fail the dev server or change its exit status. A run cancelled by `s`, a restart or a newer edit stays "cancelling" until browser cleanup finishes. In plain mode, `tests` runs the current scope and prints totals, uncollected stories, run errors and up to 10 failures; `stop` cancels.

### Watch

```bash
pnpm histoire dev --test-watch
```

`--test-watch` runs the whole book once collection is ready, then reruns only the stories affected by each edit. Without the flag, watch is off; toggle it with `w` (or `watch` in plain mode). Watch applies to the scope selected when it is enabled; navigating views never retargets it.

Selection is conservative: shared setup files, structural or resolution changes, and parts of the module graph Histoire cannot trace rerun the whole selected scope. Modules known to be unrelated to the scope trigger no run. Edits made during a run cancel it, wait for confirmed cleanup, then run one successor covering the interrupted and new stories.

Watch pauses instead of broadening when the selected story or variant was removed, when collection fails (it resumes after collection completes), and after a runner failure (it resumes on the next edit). When the queue is full it retries with a short backoff. After a runtime restart the retained watch scope runs once the new catalog is ready. Generated output does not trigger runs.

## Errors outside tests

A story that throws outside its test cases (failed import, mount timeout, uncaught error or rejection) fails the run without discarding results of other variants. When the error can be traced to a variant, that variant gets a failed `Variant error` result; otherwise the run reports it as a whole.

## Accessibility checks

Install [official accessibility plugin](./plugins/a11y.md) and enable `HstA11y({ test: true })` to add fresh-mount axe-core test per variant, including stories without authored tests. All violations fail by default; checks needing manual review remain informational.

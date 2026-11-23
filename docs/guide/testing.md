# Browser tests and runtime migration <Badge type="tip" text="1.0-beta.2+" />

Histoire collects and runs story tests in the same kind of browser iframe it uses to render variants. Tests use your project's Vitest installation and can use Vitest mocks.

## Install Vitest browser runtime

Install Vitest 5 and its Playwright provider in the project:

```bash
pnpm add -D vitest@^5.1.1 @vitest/browser-playwright@^5.1.1 playwright
```

Keep `vitest` and `@vitest/browser-playwright` on the same version. Histoire uses the project's installation. Existing projects can also use a matched Vitest 4 pair from 4.1.10 onward.

This remains required for development story tests even when the screenshot setup uses an already installed Chrome/Edge or the optional `playwright-core` driver. Screenshot browser discovery does not configure or replace the project Vitest browser runner; see [screenshot setup](./ui-screenshots-mcp.md) for that separate path.

## Register story tests

Register tests with `onTest` in the story and import assertions and helpers from `vitest`. Use the provided `canvas` to inspect the rendered variant.

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

Run the tests from your project:

```bash
pnpm histoire test
```

Histoire supports `describe`/`suite`, `it`/`test`, `.only`, `.skip`, `.todo`, standard before and after hooks, `onTestFinished`, and `onTestFailed`. It skips benchmarks.

Each test case gets an isolated story mount in the workbench and in `histoire test`. Suite hooks wrap each mount. Set [`test.maxWorkers`](../reference/config.md#test-maxworkers) to limit concurrency. Histoire defaults to half the CPUs or fewer when memory is short.

Keep tests that use low-level Vitest runner classes, snapshot assertions, artifacts, or fake timers in regular Vitest spec files. Those calls report an error in story tests.

## State ownership

The story iframe owns live variant state. The workbench keeps a serializable copy for generic controls, URLs, and presets. A newly mounted story starts from its own state.

Custom `#controls` content runs in a separate iframe with the same story environment and Vitest mock support. The workbench relays serializable edits between the story and controls frames.

Keep functions, class instances, Maps, DOM nodes, and other non-serializable values in the iframe that creates them. Use serializable fields to coordinate state across frames.

## Migrating from integrated rendering

Remove the deprecated `iframe: false` option from story layouts.

```diff
- :layout="{ type: 'single', iframe: false }"
+ :layout="{ type: 'single' }"
```

Use the provided `canvas` in tests. In story code, use the story iframe's `window` and `document`.

For slow imports or mounts, increase [`test.storyCollectTimeout`](../reference/config.md#test-storycollecttimeout). This timeout also covers startup and render readiness.

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

Install the [official accessibility plugin](./plugins/a11y.md) and set `HstA11y({ test: true })` to run an axe-core test on a fresh mount of each variant, including variants without their own tests. Violations fail by default. Checks that need manual review are informational.

# Browser tests and runtime migration

Histoire renders every story inside browser iframe runtime. Same runtime collects and runs story tests, supports Vitest mocks, and owns live variant state.

## Install Vitest browser runtime

Install current stable Vitest packages in project:

```bash
pnpm add -D vitest@latest @vitest/browser-playwright@latest playwright
```

Keep `vitest` and `@vitest/browser-playwright` on same version. Histoire uses project installation instead of bundling separate Vitest copy.

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

Histoire supports `describe`/`suite`, `it`/`test`, `.only`, `.skip`, `.todo`, standard before/after lifecycle hooks, `onTestFinished`, and `onTestFailed`. Benchmarks are ignored. Each case run by `histoire test` gets fresh story mount; suite hooks therefore surround each isolated mount rather than sharing mutable mounted state between cases.

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

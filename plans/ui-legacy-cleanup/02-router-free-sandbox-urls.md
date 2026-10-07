# 02 — Router-free sandbox URLs

Depends on: 01. Owner: URL helper and focused URL regressions.

## Result

Sandbox grid links retain exact URLs without importing or initializing old `app/router.ts`.

## Files

- Modify `app/util/sandbox.ts`.
- Extend an existing sandbox/base URL suite found by slice 01; if none owns this helper, add `core-tests/sandbox-url.spec.ts` using existing URL/virtual-env setup.
- Inspect, retain: `app/components/toolbar/ToolbarNewTab.vue`, `components/story/StoryVariantGridSandboxItem.vue`, shared URL builder and runtime preamble.

## Tests first

Exercise real helper and shared builder, with a controlled Vite base; no router stub should be needed:

1. Root base and nested deployment base produce existing sandbox path/query shape.
2. Omitted variant keeps existing grid/default behavior.
3. Story/variant IDs containing spaces, slash, colon, Unicode and dot-only identifiers round-trip through URL query values without manual parsing.
4. Import helper in its existing supported browser/Vite environment without creating router/history listeners.
5. Retain current history/hash standalone route suites; sandbox links do not derive their base from current route.

Use the Vite/Vitest env fixture already present. `vi.stubEnv('BASE_URL', ...)` is acceptable where it exercises actual `import.meta.env.BASE_URL`; reset modules/env between cases. Do not introduce global storage or window mocks solely to satisfy a now-removed router import.

## Change

Replace only the router import/read:

```ts
import type { Story, Variant } from '../types'
import { getSandboxRelativeUrl } from '@histoire/shared'

/** Resolve sandbox URL from deployment base without constructing a router. */
export function getSandboxUrl(story: Story, variant?: Variant) {
  return getSandboxRelativeUrl({
    base: import.meta.env.BASE_URL as string,
    storyId: story.id,
    variantId: variant?.id,
  })
}
```

Do not change `getSandboxRelativeUrl`, `ToolbarNewTab` props, query contracts or runtime dist filenames. No module-global URL cache: base belongs to the compiled book.

## Validation

- Focused URL helper tests and existing shared route/sandbox URL tests.
- App/workbench/embed typechecks.
- A fresh app prebundle must no longer reach `app/router.ts` through `util/sandbox.ts`; event path still exists until slice 03.
- One nested-base isolated-link browser smoke during final acceptance. Unit URL proof does not establish browser navigation.

## Acceptance and handoff

Exact URLs preserved; no Vue Router dependency from sandbox URL helper. Slice 03 may now remove old router after detaching its remaining store/command consumers.

import { describe, expect, it } from 'vitest'
import { readAppSource, readAppSourceEntries } from './utils/app-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

/**
 * Source-level guards, deliberately NOT behavioral.
 *
 * The preview half lives in a generated source string whose imports only exist
 * inside a live browser sandbox, and the host half in `.vue` single-file
 * components this Node suite cannot compile. The composable they share IS
 * driven behaviorally, in `preview-iframe-host.spec.ts`; what is pinned here is
 * that the story views keep delegating to it, plus the readiness bookkeeping
 * baked into the generated runtime.
 */

describe('story views', () => {
  it('keep the preview iframe protocol in one shared composable', () => {
    // The readiness/state/selection protocol used to be copy-pasted in both
    // story views and drifted between them.
    const host = readAppSource('app/util/preview-iframe-host.ts')

    // Vite hot listeners persist for the module's lifetime: without `off`,
    // every story navigation leaks one handler holding the unmounted instance.
    expect(host).toContain('import.meta.hot.on(STORY_CHANGED_EVENT, onStoryChanged)')
    expect(host).toContain('import.meta.hot?.off(STORY_CHANGED_EVENT, onStoryChanged)')

    // Scanned over the whole story component directory rather than the two
    // known views, so a third view cannot grow its own copy unnoticed.
    const views = readAppSourceEntries('app/components/story')
    expect(views.length).toBeGreaterThanOrEqual(2)

    for (const [path, source] of views) {
      expect(source, path).not.toContain('import.meta.hot')
      expect(source, path).not.toContain(`useEventListener(window, 'message'`)
    }

    // And the two iframe-hosting views really do use the composable.
    for (const view of [
      'app/components/story/StoryVariantGrid.vue',
      'app/components/story/StoryVariantSingleIframe.vue',
    ]) {
      expect(readAppSource(view), view).toContain('usePreviewIframeHost({')
    }
  })
})

describe('preview runtime readiness bookkeeping', () => {
  const source = generatePreviewRuntimeSource()

  it('snapshots exact ready variant ids', () => {
    expect(source).toContain('function postVariantStateSnapshotById(story, variantId)')
    expect(source).toContain('postVariantStateSnapshotById(story.value, variantId)')
  })

  it('waits for ready variants before pushing preview state back to host', () => {
    expect(source).toContain('const readyVariantIds = new Set()')
    expect(source).toContain('if (!readyVariantIds.has(targetVariant.id))')
    expect(source).toContain('readyVariantIds.add(variantId)')
    expect(source).toContain('readyVariantIds.add(targetVariant.id)')
  })

  it('only emits one SANDBOX_READY on initial mount', () => {
    // The pre-fix code unconditionally re-emitted SANDBOX_READY with a stale
    // variantId after the conditional emission. The else branch makes the two
    // mutually exclusive.
    expect(source).toMatch(/if \(initialSelection\.storyId\) \{[\s\S]+?\}\s+else \{\s+postToParent\(\{ type: SANDBOX_READY/)
  })

  it('preserves the mounted preview when a runtime error overlays it', () => {
    // Wiping document.body.innerHTML on every error blew away the running
    // preview when a late unhandled rejection fired; the overlay path keeps
    // the mounted app intact.
    expect(source).toContain('const appMounted = !!document.getElementById(\'app\')')
    expect(source).toContain('RUNTIME_ERROR_OVERLAY_ID')
    expect(source).toContain('overlay.appendChild(createRuntimeErrorBlock(message))')
  })
})

import { describe, expect, it } from 'vitest'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

/** Guards for generated runtime readiness; host behavior lives in runtime-frame suites. */

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

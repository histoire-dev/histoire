import fs from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'

describe('story grid preview readiness', () => {
  it('marks ready variant from sandbox event instead of current route variant', () => {
    const componentPath = resolve(process.cwd(), '../histoire-app/src/app/components/story/StoryVariantGrid.vue')
    const source = fs.readFileSync(componentPath, 'utf8')

    expect(source).toContain('const variant = storyStore.getCurrentStoryVariantById(event.data.variantId)')
    expect(source).toContain('if (!event.data.variantId)')
    expect(source).not.toContain(`case SANDBOX_READY:
      if (storyStore.currentVariant)`)
  })

  it('routes incoming state updates through exact variant ids', () => {
    const componentPath = resolve(process.cwd(), '../histoire-app/src/app/components/story/StoryVariantGrid.vue')
    const source = fs.readFileSync(componentPath, 'utf8')

    expect(source).toContain('stateSync.applyIncomingState(event.data.variantId, event.data.state)')
  })

  it('snapshots exact ready variant ids in preview runtime', () => {
    const runtimePath = resolve(process.cwd(), '../histoire/src/node/virtual/preview-runtime.ts')
    const source = fs.readFileSync(runtimePath, 'utf8')

    expect(source).toContain('function postVariantStateSnapshotById(story, variantId)')
    expect(source).toContain('postVariantStateSnapshotById(story.value, variantId)')
  })

  it('waits for ready variants before pushing preview state back to host', () => {
    const runtimePath = resolve(process.cwd(), '../histoire/src/node/virtual/preview-runtime.ts')
    const source = fs.readFileSync(runtimePath, 'utf8')

    expect(source).toContain('const readyVariantIds = new Set()')
    expect(source).toContain('if (!readyVariantIds.has(targetVariant.id))')
    expect(source).toContain('readyVariantIds.add(variantId)')
    expect(source).toContain('readyVariantIds.add(targetVariant.id)')
  })

  it('only emits one SANDBOX_READY on initial mount', () => {
    const runtimePath = resolve(process.cwd(), '../histoire/src/node/virtual/preview-runtime.ts')
    const source = fs.readFileSync(runtimePath, 'utf8')

    // The pre-fix code unconditionally re-emitted SANDBOX_READY with a stale
    // variantId after the conditional emission. The else branch makes the two
    // mutually exclusive.
    expect(source).toMatch(/if \(initialSelection\.storyId\) \{[\s\S]+?\}\s+else \{\s+postToParent\(\{ type: SANDBOX_READY/)
  })

  it('preserves the mounted preview when a runtime error overlays it', () => {
    const runtimePath = resolve(process.cwd(), '../histoire/src/node/virtual/preview-runtime.ts')
    const source = fs.readFileSync(runtimePath, 'utf8')

    // Wiping document.body.innerHTML on every error blew away the running
    // preview when a late unhandled rejection fired; the overlay path keeps
    // the mounted app intact.
    expect(source).toContain('const appMounted = !!document.getElementById(\'app\')')
    expect(source).toContain('RUNTIME_ERROR_OVERLAY_ID')
    expect(source).toContain('overlay.appendChild(createRuntimeErrorBlock(message))')
  })
})

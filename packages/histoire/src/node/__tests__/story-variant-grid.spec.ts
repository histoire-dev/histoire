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
})

import { runInNewContext } from 'node:vm'
import { createVariantStateSyncGuards, getVariantStateKey } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { previewApp } from '../virtual/preview-runtime/app.js'
import { previewVariantBridge } from '../virtual/preview-runtime/variant-bridge.js'

describe('matrix frame state ownership', () => {
  it.each([false, true])('matrix=%s keeps snapshots and local edits in the correct frame', (matrix) => {
    const appSource = previewApp()
    const watcherSource = appSource.slice(appSource.indexOf('function syncVariantStateWatchers'), appSource.indexOf('async function waitForVariantSnapshot'))
    const snapshotSource = previewVariantBridge().split('if (import.meta.hot)')[0]
    const postToParent = vi.fn()
    const guards = createVariantStateSyncGuards()
    let onState: (value: Record<string, any>) => void
    const targetVariant = { id: 'variant', state: { size: 'md' } }
    const story = { id: 'story', variants: [targetVariant] }
    const runtime = runInNewContext(`${snapshotSource}; ${watcherSource}; ({ postVariantStateSnapshot, syncVariantStateWatchers })`, {
      initialSelection: { matrix, controls: false },
      postToParent,
      STATE_SYNC: 'state',
      getVariantStateKey,
      toRawDeep: (value: any) => value,
      stopVariantStateWatchers: () => {},
      variantStateGuards: guards,
      readyVariantIds: new Set(['variant']),
      variantStateWatchStops: new Map(),
      /** Captures actual generated watcher rather than simulating its policy. */
      watch: (_source: () => unknown, callback: typeof onState) => {
        onState = callback
        return () => {}
      },
    })
    runtime.syncVariantStateWatchers(story)
    runtime.postVariantStateSnapshot('story', targetVariant)
    targetVariant.state.size = 'lg'
    onState!({ size: 'lg' })
    if (matrix) {
      expect(postToParent).not.toHaveBeenCalled()
    }
    else {
      expect(postToParent).toHaveBeenCalledTimes(2)
      expect(postToParent).toHaveBeenLastCalledWith({ type: 'state', storyId: 'story', variantId: 'variant', state: { size: 'lg' } })
    }
    guards.suppress('story:variant')
    onState!({ size: 'sm' })
    expect(guards.consume('story:variant')).toBe(false)
    expect(postToParent).toHaveBeenCalledTimes(matrix ? 0 : 2)
  })
})

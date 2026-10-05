import type { Context } from '../../context.js'
import { describe, expect, it, vi } from 'vitest'
import { resolvedStories } from '../../virtual/resolved-stories.js'
import { evaluateVirtualModule } from '../utils/embed/virtual-module.js'

/** Executes metadata-only generated module with Vite's retained HMR data. */
function evaluateMetadata(data: Record<string, unknown>) {
  let accept: (module: any) => void = () => {}
  const hot = { data, accept: (callback: typeof accept) => {
    accept = callback
  } }
  const source = resolvedStories({ storyFiles: [], config: { tree: { order: 'asc' } } } as unknown as Context)
  // Generated loaders remain lazy; evaluating metadata executes no story module.
  const module = evaluateVirtualModule<{ files: unknown[], tree: unknown[], onUpdate: (listener: (...args: any[]) => void) => () => void }>(source, { 'import.meta.hot': 'hot' }, { hot })
  return { module, update: (next: any) => accept(next) }
}

describe('story metadata subscriptions', () => {
  it('keeps one subscription across HMR and lets original disposer remove replacement listener', () => {
    const data = {}
    const first = evaluateMetadata(data)
    const listener = vi.fn()
    const off = first.module.onUpdate(listener)
    const second = evaluateMetadata(data)
    first.update(second.module)
    expect(listener).toHaveBeenCalledOnce()
    off()
    const third = evaluateMetadata(data)
    second.update(third.module)
    expect(listener).toHaveBeenCalledOnce()
    const active = vi.fn()
    third.module.onUpdate(active)
    third.update(undefined)
    expect(active).not.toHaveBeenCalled()
  })
})

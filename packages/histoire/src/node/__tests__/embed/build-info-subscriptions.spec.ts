import type { HistoireBuildInfo } from '@histoire/shared'
import type { Context } from '../../context.js'
import { describe, expect, it, vi } from 'vitest'
import { resolvedBuildInfo } from '../../virtual/build-info.js'
import { evaluateVirtualModule } from '../utils/embed/virtual-module.js'

/** Evaluate actual metadata module with the retained Vite HMR owner. */
async function metadata(data: Record<string, unknown>) {
  let accept: (module: unknown) => void = () => {}
  const hot = { data, accept: (callback: typeof accept) => accept = callback }
  const source = await resolvedBuildInfo({ root: '/missing-book', mode: 'dev', config: {}, storyFiles: [] } as unknown as Context)
  const module = evaluateVirtualModule<{ buildInfo: HistoireBuildInfo, onBuildInfoUpdate: (listener: (value: HistoireBuildInfo) => void) => () => void }>(source, { 'import.meta.hot': 'hot' }, { hot })
  return { module, update: (next: unknown) => accept(next) }
}

describe('build metadata publication ownership', () => {
  it('updates modify/add/remove metadata across HMR while original disposer still retires its owner', async () => {
    const data = {}
    const first = await metadata(data)
    const listener = vi.fn()
    const off = first.module.onBuildInfoUpdate(listener)
    const second = await metadata(data)
    const changed = { builtAt: 'generation-start', changed: [{ storyId: 'button', kind: 'changed' as const }, { storyId: 'new', kind: 'new' as const }] }
    first.update({ buildInfo: changed })
    expect(listener).toHaveBeenLastCalledWith(changed)
    second.update({ buildInfo: { ...changed, changed: [] } })
    expect(listener).toHaveBeenLastCalledWith({ ...changed, changed: [] })
    off()
    const third = await metadata(data)
    second.update(third.module)
    expect(listener).toHaveBeenCalledTimes(2)
    third.update(undefined)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

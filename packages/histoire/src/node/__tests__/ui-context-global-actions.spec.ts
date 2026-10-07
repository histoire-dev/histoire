import type { WorkbenchContextTarget } from '../../../../histoire-app/src/app/composables/context-menu.js'
import { describe, expect, it, vi } from 'vitest'
import { createContextMenu } from '../../../../histoire-app/src/app/composables/context-menu.js'

describe('workbench global context actions', () => {
  it.each<WorkbenchContextTarget>([
    { kind: 'frame', label: 'Variant', frame: { storyId: 'story', variantId: 'variant', frameKey: 'frame' } },
    { kind: 'folder', label: 'Folder', key: 'folder', expanded: false },
  ])('appends global actions once for $kind targets and retains capability filtering', (target) => {
    const menu = createContextMenu()
    const local = { id: 'local', label: 'Local', icon: 'copy', run: vi.fn() }
    const hidden = { ...local, id: 'hidden', available: () => false }
    const global = { ...local, id: 'global', global: true }
    menu.register(local)
    menu.register(hidden)
    const dispose = menu.register(global)
    menu.state.actionIds = ['global', 'local', 'hidden', 'local', 'global']

    expect(menu.list(target).map(action => action.id)).toEqual(['local', 'global'])
    menu.state.actionIds = []
    expect(menu.list(target)).toEqual([global])
    dispose()
    expect(menu.list(target)).toEqual([])
  })

  it('filters global availability and blocks stale execution without affecting another owner', async () => {
    const menu = createContextMenu()
    const other = createContextMenu()
    const target = { kind: 'story' as const, label: 'Story' }
    let available = true
    const run = vi.fn()
    const action = { id: 'global', label: 'Global', icon: 'screen-off', global: true, available: () => available, run }
    menu.register(action)
    expect(menu.list(target)).toEqual([action])
    expect(other.list(target)).toEqual([])
    available = false
    expect(menu.list(target)).toEqual([])
    await menu.run(action, target)
    expect(run).not.toHaveBeenCalled()
  })
})

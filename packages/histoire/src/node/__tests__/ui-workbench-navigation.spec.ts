import type { HistoireTarget } from '@histoire/protocol'
import type { ShellPane } from '../../../../histoire-app/src/app/stores/shell.js'
import { describe, expect, it, vi } from 'vitest'
import { activateWorkspacePane } from '../../../../histoire-app/src/app/standalone/workbench-navigation.js'

type WorkspacePane = Exclude<ShellPane, 'home'>

/** Creates route and pane spies for one rail activation. */
function fixture(route: string, selection: HistoireTarget | null) {
  let currentRoute = route
  const restore = vi.fn(async () => {
    currentRoute = 'story'
  })
  const home = vi.fn(async () => {
    currentRoute = 'home'
  })
  const showPane = vi.fn()
  return {
    currentRoute: () => currentRoute,
    restore,
    home,
    showPane,
    activate: (pane: WorkspacePane) => activateWorkspacePane({ pane, currentRoute: () => currentRoute, selection: () => selection, navigation: { restore, home }, showPane }),
  }
}

describe('workbench workspace-pane navigation', () => {
  const target = { storyId: 'buttons:primary', variantId: 'dark/雪' }

  it.each<WorkspacePane>(['stories', 'search', 'tests', 'comments', 'mcp'])('restores the exact story before opening %s from Settings', async (pane) => {
    const subject = fixture('settings', target)

    await expect(subject.activate(pane)).resolves.toBe(true)

    expect(subject.restore).toHaveBeenCalledOnce()
    expect(subject.restore).toHaveBeenCalledWith(target)
    expect(subject.home).not.toHaveBeenCalled()
    expect(subject.showPane).toHaveBeenCalledWith(pane)
  })

  it('leaves normal Story and Home pane activations route-free', async () => {
    for (const route of ['story', 'home']) {
      const subject = fixture(route, target)
      await expect(subject.activate('search')).resolves.toBe(true)
      expect(subject.restore).not.toHaveBeenCalled()
      expect(subject.home).not.toHaveBeenCalled()
      expect(subject.showPane).toHaveBeenCalledWith('search')
    }
  })

  it('falls back to Home without fabricating a story when Settings has no selection', async () => {
    const subject = fixture('settings', null)

    await expect(subject.activate('stories')).resolves.toBe(true)

    expect(subject.restore).not.toHaveBeenCalled()
    expect(subject.home).toHaveBeenCalledOnce()
    expect(subject.showPane).toHaveBeenCalledWith('stories')
  })

  it('reports failed Settings restore without opening a pane', async () => {
    const subject = fixture('settings', target)
    subject.restore.mockImplementation(async () => {})

    await expect(subject.activate('comments')).rejects.toThrow('Could not leave Settings before opening workspace pane.')

    expect(subject.showPane).not.toHaveBeenCalled()
  })
})

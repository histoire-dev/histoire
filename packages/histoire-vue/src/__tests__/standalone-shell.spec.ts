import { describe, expect, it } from 'vitest'
import { handleShellShortcut } from '../../../histoire-app/src/app/components/shell/shortcuts.js'
import { createShell, SHELL_STORAGE_KEY } from '../../../histoire-app/src/app/stores/shell.js'

describe('standalone shell ownership', () => {
  it('opens selected panes, collapses repeated selection and persists one coherent state', () => {
    window.localStorage.removeItem(SHELL_STORAGE_KEY)
    const shell = createShell({ dev: true, storage: window.localStorage })
    try {
      shell.togglePanel()
      expect(shell.panelOpen.value).toBe(false)
      shell.selectPane('search')
      expect(shell.panelOpen.value).toBe(true)
      expect(JSON.parse(window.localStorage.getItem(SHELL_STORAGE_KEY)!)).toEqual({ pane: 'search', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 })
      shell.selectPane('search')
      expect(shell.panelOpen.value).toBe(false)
      shell.selectPane('home')
      expect(shell.pane.value).toBe('home')
      expect(shell.panelOpen.value).toBe(false)
      shell.togglePanel()
      expect(shell.pane.value).toBe('stories')
      expect(shell.panelOpen.value).toBe(true)
    }
    finally {
      shell.close()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })

  it.each(['tests', 'comments', 'mcp', 'unknown'])('recovers persisted hidden or unknown pane %s in static mode', (pane) => {
    window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ pane, panelOpen: true, inspectorOpen: false }))
    const shell = createShell({ dev: false, storage: window.localStorage })
    try {
      expect(shell.pane.value).toBe('stories')
      expect(shell.panelOpen.value).toBe(true)
      expect(shell.inspectorOpen.value).toBe(false)
      shell.selectPane('tests')
      expect(shell.pane.value).toBe('stories')
    }
    finally {
      shell.close()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })

  it('closes narrow panels after selection without changing desktop choice or another shell', () => {
    const shell = createShell({ dev: true })
    const other = createShell({ dev: false })
    try {
      shell.setNarrow(640)
      shell.closePanelAfterSelection()
      expect(shell.panelOpen.value).toBe(false)
      expect(other.panelOpen.value).toBe(true)
      shell.selectPane('stories')
      shell.setNarrow(641)
      shell.closePanelAfterSelection()
      expect(shell.panelOpen.value).toBe(true)
      shell.close()
      shell.selectPane('search')
      expect(shell.pane.value).toBe('stories')
    }
    finally {
      shell.close()
      other.close()
    }
  })

  it('ignores malformed persistence and inaccessible storage', () => {
    const shell = createShell({ dev: true, storage: { getItem: () => '{', setItem: () => {
      throw new Error('blocked')
    } } })
    try {
      shell.togglePanel()
      expect(shell.panelOpen.value).toBe(false)
    }
    finally { shell.close() }
  })

  it('persists panel widths without losing pane and visibility choices', () => {
    window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ pane: 'search', panelOpen: true, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 }))
    const shell = createShell({ dev: true, storage: window.localStorage })
    try {
      shell.setNarrow(1440)
      expect(shell.panelWidth.value).toBe(310)
      expect(shell.inspectorWidth.value).toBe(380)
      shell.setPanelWidth(420)
      shell.setInspectorWidth(460)
      expect(JSON.parse(window.localStorage.getItem(SHELL_STORAGE_KEY)!)).toEqual({ pane: 'search', panelOpen: true, inspectorOpen: false, panelWidth: 420, inspectorWidth: 460 })
      shell.close()
      shell.setPanelWidth(260)
      expect(shell.panelWidth.value).toBe(420)
    }
    finally {
      shell.close()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })

  it('bounds both panels to container space while retaining preferred widths on expansion', () => {
    const shell = createShell({ dev: true })
    try {
      shell.setNarrow(1440)
      shell.setInspectorAvailable(true)
      shell.setPanelWidth(500)
      shell.setInspectorWidth(600)
      expect(1440 - 56 - shell.panelWidth.value - shell.inspectorWidth.value - 24).toBeGreaterThanOrEqual(160)
      shell.setNarrow(700)
      expect(700 - 56 - shell.panelWidth.value - shell.inspectorWidth.value - 24).toBeGreaterThanOrEqual(160)
      shell.setNarrow(1440)
      expect(shell.panelWidth.value).toBe(500)
      expect(shell.inspectorWidth.value).toBe(600)
      shell.setNarrow(390)
      expect(shell.panelWidth.value).toBeLessThanOrEqual(342)
      expect(shell.inspectorWidth.value).toBeLessThanOrEqual(366)
    }
    finally { shell.close() }
  })

  it('normalizes invalid persisted widths and ignores nonfinite resize values', () => {
    const shell = createShell({ dev: true, storage: { getItem: () => JSON.stringify({ panelWidth: -20, inspectorWidth: 'large' }), setItem: () => {} } })
    try {
      expect(shell.panelWidth.value).toBe(200)
      expect(shell.inspectorWidth.value).toBe(344)
      shell.setPanelWidth(Number.NaN)
      shell.setInspectorWidth(Number.POSITIVE_INFINITY)
      expect(shell.panelWidth.value).toBe(200)
      expect(shell.inspectorWidth.value).toBe(344)
    }
    finally { shell.close() }
  })
})

describe('shell theme shortcut', () => {
  it('claims ctrl/meta shift d only inside its exact provider', () => {
    const root = document.createElement('div')
    root.className = 'histoire-provider'
    const input = root.appendChild(document.createElement('input'))
    const nested = root.appendChild(document.createElement('div'))
    nested.className = 'histoire-provider'
    const child = nested.appendChild(document.createElement('input'))
    let count = 0
    root.addEventListener('keydown', event => handleShellShortcut(event, root, () => count++))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(count).toBe(1)
  })
})

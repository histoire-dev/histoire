import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { getRegisteredFrameTarget } from '../../../histoire-app/src/app/components/canvas/frame-target.js'
import MatrixCell from '../../../histoire-app/src/app/components/canvas/matrix/MatrixCell.vue'
import { useSpacePan } from '../../../histoire-app/src/app/components/canvas/pan/useSpacePan.js'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { registerFrameShortcuts } from '../../../histoire-app/src/app/util/frame-actions.js'
import { createShortcutRegistry } from '../../../histoire-app/src/app/util/shortcuts.js'

describe('embedded canvas Space ownership', () => {
  it('handles bubbled Space after mounting its window listener', async () => {
    const Host = defineComponent({
      setup() {
        const root = ref<HTMLElement>()
        const pan = useSpacePan({ getRoot: () => root.value })
        return () => h('div', { ref: root, role: 'region', tabindex: '-1' }, pan.held.value ? 'Panning' : 'Ready')
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    try {
      const root = wrapper.get('[role=region]')
      root.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
      await nextTick()
      expect(root.text()).toBe('Panning')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('accepts Space from canvas chrome in host frame document', () => {
    const host = document.createElement('iframe')
    document.body.append(host)
    const frameDocument = host.contentDocument!
    const root = frameDocument.createElement('div')
    frameDocument.body.append(root)
    const pan = useSpacePan({ getRoot: () => root })
    try {
      root.addEventListener('keydown', event => pan.onKeyDown(event))
      root.dispatchEvent(new frameDocument.defaultView!.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
      expect(pan.held.value).toBe(true)
    }
    finally {
      host.remove()
    }
  })
})

describe('matrix cell frame input', () => {
  it('opens exact local target through pointer and both menu keys without changing matrix selection', async () => {
    const canvas = createCanvasStore()
    const frames = createCanvasFrames(canvas)
    const matrix = createMatrixStore()
    const menu = createContextMenu()
    matrix.activate('a:b', [{ name: 'enabled', values: [false, true] }, { name: 'emphasized', values: [false, true] }], {})
    const cell = matrix.cells.value[0]!
    const frame = { id: cell.key, storyId: 'a:b', variantId: 'c', x: 0, y: 0, width: 720, height: 640 }
    const variant = ref('c')
    matrix.selectCell(cell.key)
    const selected = matrix.selectedCell.value?.key
    const Host = defineComponent({
      setup() {
        provideCanvas(canvas, frames)
        provideMatrix(matrix)
        provideContextMenu(menu)
        return () => h(MatrixCell, { cell, frame, live: false, variantId: variant.value, previewBase: 'https://book.test/' })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    try {
      const section = wrapper.get('.histoire-matrix-cell')
      const select = wrapper.get('.histoire-matrix-cell-select')
      const target = { storyId: 'a:b', variantId: 'c', frameKey: cell.key }
      await section.trigger('contextmenu', { clientX: 46, clientY: 82 })
      expect(menu.state.target).toEqual(target)
      expect(matrix.selectedCell.value?.key).toBe(selected)
      expect(getRegisteredFrameTarget(select.element, frames)).toEqual(target)
      await select.trigger('keydown', { key: 'F10', shiftKey: true })
      expect(menu.state.target).toEqual(target)
      await select.trigger('keydown', { key: 'ContextMenu' })
      expect(menu.state.target).toEqual(target)
      variant.value = 'replacement'
      await nextTick()
      await select.trigger('keydown', { key: 'ContextMenu' })
      expect(menu.state.target).toEqual({ ...target, variantId: 'replacement' })
      expect(matrix.selectedCell.value?.key).toBe(selected)
    }
    finally {
      wrapper.unmount()
      matrix.close()
    }
  })

  it('runs a frame shortcut against focused Matrix chrome rather than canonical selection', () => {
    const canvas = createCanvasStore()
    const frames = createCanvasFrames(canvas)
    const frame = frames.registerFrame({ id: 'matrix-cell', storyId: 'a:b', variantId: 'matrix-base', rect: { x: 0, y: 0, width: 720, height: 640 } })
    const chrome = document.createElement('button')
    chrome.dataset.frameId = 'matrix-cell'
    document.body.append(chrome)
    const shortcuts = createShortcutRegistry()
    const screenshot = { id: 'screenshot', label: 'Screenshot', icon: 'camera', run: vi.fn() }
    const actions = { entries: new Map([['screenshot', screenshot]]), list: () => [screenshot], run: vi.fn() }
    const canonical = { storyId: 'a:b', variantId: 'canonical', frameKey: 'canonical-frame' }
    const dispose = registerFrameShortcuts(shortcuts, actions as never, event => event ? getRegisteredFrameTarget(event.target, frames) : canonical)
    const event = { key: 's', code: 'KeyS', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, repeat: false, target: chrome, preventDefault: vi.fn() } as unknown as KeyboardEvent
    try {
      expect(shortcuts.handle(event, ['frame'], true)).toBe(true)
      expect(actions.run).toHaveBeenCalledWith(screenshot, { storyId: 'a:b', variantId: 'matrix-base', frameKey: 'matrix-cell' })
    }
    finally {
      dispose()
      frame()
      chrome.remove()
    }
  })
})

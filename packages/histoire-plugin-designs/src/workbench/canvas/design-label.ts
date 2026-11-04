import type { ResolvedDesign } from '../../types.js'
import { element } from './design-element.js'

/** Canvas label above the design box, with a switch when several designs are declared. */
export interface DesignLabel {
  /** Label element, placed once in the design column. */
  node: HTMLElement
  /**
   * Shows the name of a single design, or one switch button per design.
   * @param designs Valid designs of the selected variant.
   * @param activeIndex Entry index of the active design.
   */
  render: (designs: ResolvedDesign[], activeIndex: number) => void
}

/**
 * Creates the design label. Switch buttons are reused across renders, only their text and
 * pressed state change, so keyboard focus survives clicks and model notifications.
 * @param onSelect Receives the entry index (`ResolvedDesign.index`) of a clicked design.
 */
export function createDesignLabel(onSelect: (entryIndex: number) => void): DesignLabel {
  const node = element('div', 'histoire-designs-canvas-label')
  const name = element('span', '')
  const group = element('div', 'histoire-designs-canvas-switches')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Design')
  /** Switch buttons in display order; each reads its entry index from `data-index`. */
  const buttons: HTMLButtonElement[] = []

  /**
   * Creates a switch button; its entry index is read on click so the button can be reused.
   */
  function createButton(): HTMLButtonElement {
    const button = element('button', 'histoire-designs-canvas-switch')
    button.type = 'button'
    button.addEventListener('click', () => onSelect(Number(button.dataset.index)))
    return button
  }

  return {
    node,
    render(designs, activeIndex) {
      if (designs.length <= 1) {
        name.textContent = designs[0]?.name ?? ''
        if (node.firstChild !== name) node.replaceChildren(name)
        return
      }
      // Grow or shrink the button list to the design count, keeping existing buttons in place.
      while (buttons.length > designs.length) buttons.pop()!.remove()
      while (buttons.length < designs.length) {
        const button = createButton()
        buttons.push(button)
        group.append(button)
      }
      designs.forEach((design, position) => {
        const button = buttons[position]
        if (button.textContent !== design.name) button.textContent = design.name
        button.dataset.index = String(design.index)
        button.setAttribute('aria-pressed', String(design.index === activeIndex))
      })
      if (node.firstChild !== group) node.replaceChildren(group)
    },
  }
}

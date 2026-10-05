/** Menu measurement owned by one displayed popper and closed with that overlay. */
export interface ControlsMenuBounds {
  /** Refresh after anchor geometry changes or vendor positioning completes. */
  update: () => void
  /** Disconnect observers; late callbacks become inert. */
  close: () => void
}

/** Fit complete choices inside FloatingVue's content box, including fractional borders. */
export function observeControlsMenuBounds(list: HTMLElement, height: (value: number | undefined) => void): ControlsMenuBounds {
  const inner = list.closest<HTMLElement>('.v-popper__inner')
  const view = list.ownerDocument.defaultView
  let active = true
  let delivered = false
  let previous: number | undefined
  /** Use the vendor's boundary constraint, never its height resulting from our own cap. */
  function update(): void {
    if (!active || !inner || !view) return
    const style = view.getComputedStyle(inner)
    const maximum = Number.parseFloat(style.maxHeight)
    // FloatingVue temporarily clears maxHeight while asynchronously computing
    // its next position. Retain the last bounded scrollport during that gap:
    // expanding it would reset scrollTop and conceal the focused choice.
    if (!Number.isFinite(maximum) && previous !== undefined) return
    const borders = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    // Floor prevents a partially clipped last row under transformed hosts. Reading
    // clientHeight here would feed the imposed cap back into itself on each resize.
    const value = Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum - borders)) : undefined
    if (!delivered || value !== previous) {
      delivered = true
      previous = value
      height(value)
    }
  }
  const resize = inner && view?.ResizeObserver ? new view.ResizeObserver(update) : undefined
  const mutation = inner && view?.MutationObserver ? new view.MutationObserver(update) : undefined
  if (inner) {
    resize?.observe(inner)
    // Increasing a boundary can leave the current menu unchanged, so observe the
    // vendor's inline constraint as well as the resulting content dimensions.
    mutation?.observe(inner, { attributes: true, attributeFilter: ['style'] })
  }
  update()
  return {
    update,
    close() {
      if (!active) return
      active = false
      try {
        resize?.disconnect()
      }
      finally {
        mutation?.disconnect()
      }
    },
  }
}

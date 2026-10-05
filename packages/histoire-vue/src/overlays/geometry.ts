import type { HistoireControlsRect } from '@histoire/protocol'

/** Convert viewport anchor into provider padding box, including transformed hosts. */
export function providerOverlayRect(root: HTMLElement, anchor: HistoireControlsRect): HistoireControlsRect {
  const rect = root.getBoundingClientRect()
  const scaleX = root.offsetWidth ? rect.width / root.offsetWidth : 1
  const scaleY = root.offsetHeight ? rect.height / root.offsetHeight : 1
  return { x: (anchor.x - rect.x) / scaleX - root.clientLeft, y: (anchor.y - rect.y) / scaleY - root.clientTop, width: anchor.width / scaleX, height: anchor.height / scaleY }
}

import type { ResolvedDesign } from '../../types.js'
import { iframeAttributes } from '../../designs/iframe-attrs.js'

/** Canvas-space size of a design box. */
export interface BoxSize {
  /** Width in canvas units. */
  width: number
  /** Height in canvas units. */
  height: number
}

/** Callbacks of image designs, which settle after the element is placed. */
export interface DesignElementEvents {
  /** Receives the final box size once an image with an intrinsic size loads. */
  onSize: (size: BoxSize) => void
  /** Called when an image fails to load; the box keeps its default size. */
  onError: () => void
}

/** Default box of iframes, of images before they load and of images without intrinsic size. */
export const EMBED_SIZE: BoxSize = { width: 960, height: 720 }
/** Box of link cards. */
const LINK_SIZE: BoxSize = { width: 360, height: 140 }

/**
 * Creates an element with a class and optional text.
 * @param tag Tag name.
 * @param className Class attribute.
 * @param text Text content.
 */
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * Renders one design for the canvas. Images report their natural size (times the declared
 * scale) once loaded so the view can size its box and re-fit. The image `offset` is ignored
 * here: the canvas is panned by the user, so it only applies to the inspector viewer.
 * @param design Design to render.
 * @param events Image load callbacks.
 */
export function createDesignElement(design: ResolvedDesign, events: DesignElementEvents): { node: HTMLElement, size: BoxSize } {
  if (design.type === 'image') {
    const image = element('img', 'histoire-designs-canvas-image')
    image.alt = design.alt
    image.draggable = false
    image.addEventListener('load', () => {
      // SVGs without width/height report 0: keep the default box, `object-fit` scales them.
      if (!image.naturalWidth || !image.naturalHeight) return
      const scale = design.scale ?? 1
      events.onSize({ width: image.naturalWidth * scale, height: image.naturalHeight * scale })
    }, { once: true })
    image.addEventListener('error', () => events.onError(), { once: true })
    image.src = design.src
    return { node: image, size: EMBED_SIZE }
  }
  if (design.type === 'link') {
    const card = element('div', 'histoire-designs-canvas-link')
    const anchor = element('a', '', design.label)
    Object.assign(anchor, { href: design.externalUrl, target: '_blank', rel: 'noopener noreferrer' })
    card.append(anchor, element('span', 'histoire-designs-canvas-url', design.externalUrl))
    return { node: card, size: LINK_SIZE }
  }
  const frame = element('iframe', 'histoire-designs-canvas-embed')
  for (const [name, value] of Object.entries(iframeAttributes(design))) frame.setAttribute(name, value)
  return { node: frame, size: EMBED_SIZE }
}

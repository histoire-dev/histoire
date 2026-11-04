import type { ResolvedEmbedDesign } from '../types.js'
import { describe, expect, it } from 'vitest'
import { iframeAttributes } from '../designs/iframe-attrs.js'

/**
 * Plain iframe design loading `src`.
 * @param src Iframe URL.
 */
function design(src: string): ResolvedEmbedDesign {
  return { index: 0, type: 'iframe', name: 'Spec', src, externalUrl: src, allowFullscreen: false }
}

describe('design iframe attributes', () => {
  it('keeps same-origin access only for designs served from another origin', () => {
    expect(iframeAttributes(design('https://www.figma.com/design/KEY'), 'https://book.test').sandbox).toContain('allow-same-origin')
    const local = iframeAttributes(design('https://book.test/designs/spec.html'), 'https://book.test').sandbox
    expect(local).toContain('allow-scripts')
    expect(local).not.toContain('allow-same-origin')
  })
})

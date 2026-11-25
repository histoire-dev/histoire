import type { PreviewStoryCallback } from '@histoire/shared'
import { getFramePurpose } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { createControlsReplicaUrl, createRuntimeFrameUrl, createTestWorkerUrl } from '../../../../histoire-app/src/embed/adapters/sandbox-urls.js'
import { renderPreviewStories } from '../build/collect.js'
import { createPreviewHostRegistry } from '../runtime/browser/preview-host.js'
import { previewInitialSelection } from '../virtual/preview-runtime/preamble.js'

// Build-time `previewStory` callbacks load documents from a served build output.
vi.mock('../preview.js', () => ({ startPreview: async () => ({ baseUrl: 'http://book.test/nested/', close: async () => {} }) }))

const target = { storyId: 'story', variantId: 'variant' }
const book = 'http://book.test/nested/'

/**
 * Runs the generated `initialSelection` declaration against one frame document
 * URL, with the real purpose parser the runtime imports from `@histoire/shared`.
 */
function readInitialSelection(url: string) {
  // eslint-disable-next-line no-new-func -- evaluates emitted runtime source
  const evaluate = new Function('window', 'getFramePurpose', `${previewInitialSelection()}\nreturn initialSelection`)
  return evaluate({ location: { search: new URL(url).search } }, getFramePurpose)
}

/** Sandbox URL the MCP/screenshot host document loads for one automation lease. */
function automationUrl() {
  const host = createPreviewHostRegistry({ base: '/nested/' })
  const lease = host.open({ origin: 'http://book.test', ...target, epoch: 'epoch', width: 320, height: 240, backgroundColor: '#fff', textDirection: 'ltr', isActive: () => true })
  const html = host.render(new URL(lease.url).pathname)!
  return JSON.parse(/"sandboxUrl":("[^"]+")/.exec(html)![1]) as string
}

/** Sandbox URL a build-time `previewStory` plugin callback (screenshots) receives. */
async function previewStoryCallbackUrl() {
  const urls: string[] = []
  const callback: PreviewStoryCallback = ({ url }) => {
    urls.push(url)
  }
  const story = { id: target.storyId, title: 'Story', variants: [{ id: target.variantId, title: 'Variant' }] }
  await renderPreviewStories({ config: {}, storyFiles: [{ path: '/story.js', story }] } as any, [callback], '/out')
  return urls[0]
}

/** Primary runtime document URL as the embed runtime frame emits it. */
function primaryUrl(base: string) {
  return createRuntimeFrameUrl(new URL(base), { target, documentId: 'primary', selectionVersion: 1, standalone: true })
}

describe('embed runtime padding', () => {
  it('passes the gutter to embed documents only; the canvas draws its own', () => {
    expect(new URL(createRuntimeFrameUrl(new URL(book), { target, documentId: 'embed', selectionVersion: 1, padding: 24 })).searchParams.get('padding')).toBe('24')
    expect(new URL(createRuntimeFrameUrl(new URL(book), { target, documentId: 'embed', selectionVersion: 1, padding: 0 })).searchParams.has('padding')).toBe(false)
    expect(new URL(createRuntimeFrameUrl(new URL(book), { target, documentId: 'canvas', selectionVersion: 1, standalone: true, padding: 24 })).searchParams.has('padding')).toBe(false)
  })
})

describe('story frame document purpose', () => {
  it.each([
    ['primary runtime', () => primaryUrl(book), { purpose: 'interactive', controls: false, matrix: false }],
    ['matrix cell', () => primaryUrl(`${book}?matrix=true`), { purpose: 'interactive', controls: false, matrix: true }],
    ['in-book test worker', () => createTestWorkerUrl(new URL(book), target, 'worker'), { purpose: 'test-worker', controls: false, matrix: false }],
    ['custom controls replica', () => createControlsReplicaUrl(book, target, 'controls'), { purpose: 'controls', controls: true, matrix: false }],
    ['MCP/screenshot automation', automationUrl, { purpose: 'automation', controls: false, matrix: false }],
    ['build previewStory callback', previewStoryCallbackUrl, { purpose: 'automation', controls: false, matrix: false }],
  ])('parses %s documents into their runtime purpose', async (_, createUrl, expected) => {
    const url = await createUrl()
    expect(new URL(url).pathname).toBe('/nested/__sandbox.html')
    // Hosts emit non-default purposes explicitly.
    expect(new URL(url).searchParams.get('purpose') ?? 'interactive').toBe(expected.purpose)
    expect(readInitialSelection(url)).toMatchObject({ ...target, ...expected })
  })

  it.each([
    ['', 'interactive'],
    ['?matrix=true', 'interactive'],
    ['?purpose=unknown', 'interactive'],
    ['?purpose=automation', 'automation'],
  ])('resolves missing or unknown query %s to %s', (search, expected) => {
    expect(getFramePurpose(new URLSearchParams(search))).toBe(expected)
  })
})

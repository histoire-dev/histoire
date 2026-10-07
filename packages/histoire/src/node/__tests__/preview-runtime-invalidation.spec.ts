import { describe, expect, it } from 'vitest'
import { readNodeSources } from './utils/node-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

/**
 * Source-level guards, deliberately NOT behavioral.
 *
 * The invalidation calls live
 * inside closures over a running Vite dev server (`ViteDevServer.moduleGraph` +
 * its WS), the self-healing reload lives in a generated source string that only
 * runs inside a browser sandbox. Current host remount/readiness is exercised by
 * `embed/runtime-frame-revisions.spec.ts`.
 *
 * The server half is asserted over the whole `server` sub-tree (see
 * `server-dev-event.spec.ts` for the same pattern) so splitting or moving those
 * files cannot silently disable the guard.
 */
describe('preview runtime staleness', () => {
  it('invalidates the preview runtime module on every collection', () => {
    const source = readNodeSources('server')

    // The generated preview runtime bakes story metadata + module loaders at
    // transform time; without invalidation, iframes keep loading stale data
    // (unknown new stories, missing variants) until a dev server restart.
    const occurrences = source.split('invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)').length - 1
    // One in collect(), one in onStoryListChange.
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('invalidates the preview runtime without pushing a client update', () => {
    const source = readNodeSources('server')

    // The preview runtime is the iframe entry module and does not self-accept:
    // sending the fabricated self-accept js-update that `invalidateModule` emits
    // would re-execute the whole runtime inside live iframes (duplicate message
    // listeners, a second app mount). The silent variant must not send updates.
    const body = source.match(/const invalidateModuleSilently = \(id: string\) => \{([\s\S]*?)\n {2}\}/)?.[1]
    expect(body).toBeTruthy()
    expect(body).toContain('invalidateModule(mod)')
    expect(body).not.toContain('ws.send')
  })

  it('reloads the iframe once when the baked selection data is stale', () => {
    const source = generatePreviewRuntimeSource()

    // Unknown story (new story file) and unknown variant (added/renamed
    // variant) both self-heal with a one-shot reload that picks up the
    // invalidated module; the sessionStorage guard prevents reload loops for
    // genuinely unknown selections.
    expect(source).toContain('function attemptStaleRuntimeReload(reasonKey)')
    expect(source).toContain('sessionStorage')
    // eslint-disable-next-line no-template-curly-in-string -- asserting on generated runtime source
    expect(source).toContain('attemptStaleRuntimeReload(`story:${selection.storyId}`)')
    // eslint-disable-next-line no-template-curly-in-string -- asserting on generated runtime source
    expect(source).toContain('attemptStaleRuntimeReload(`variant:${selection.storyId}:${selection.variantId}`)')
    // A successful selection clears the guard so later staleness can reload again.
    expect(source).toContain('clearStaleRuntimeReloadGuard()')
  })
})

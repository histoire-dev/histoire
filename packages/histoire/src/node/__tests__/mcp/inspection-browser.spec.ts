import { Buffer } from 'node:buffer'
import { computed, reactive, ref } from '@histoire/vendors/vue'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'
import { createInspectionDiagnostics } from '../../mcp/browser/inspection/diagnostics.js'
import { inspectDomDocument } from '../../mcp/browser/inspection/dom.js'
import { boundInspectionResult } from '../../mcp/browser/inspection/result.js'
import { projectVariantState } from '../../mcp/browser/inspection/state.js'
import { createInspectionTask } from '../../mcp/browser/inspection/task.js'
import { mcpInspectionResultSchema } from '../../mcp/protocol/inspection-schema.js'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { previewRuntimeService } from '../../virtual/preview-runtime/runtime-service.js'
import { createPreviewBrowserFixture } from '../utils/mcp/preview-browser.js'

describe('isolated preview inspection', () => {
  it('projects runtime props/current overrides and bounds cyclic or opaque state', () => {
    const state: any = { label: 'Save', callback: () => {}, _hPropState: { 0: { disabled: true } }, _hPropDefs: [{ name: 'Button', index: 0, props: [{ name: 'disabled', types: ['boolean'], value: false, default: false }] }] }
    state.self = state
    const getter = vi.fn(() => 'private')
    Object.defineProperty(state, 'computed', { enumerable: true, get: getter })
    const output = projectVariantState(state)
    expect(output.state.label).toBe('Save')
    expect(output.state).not.toHaveProperty('_hPropState')
    expect(JSON.stringify(output.state)).not.toContain('_hPropDefs')
    expect(getter).not.toHaveBeenCalled()
    expect(output.state.self).toBeNull()
    expect(output.components[0].props[0]).toMatchObject({ name: 'disabled', value: true, default: false })
    expect(output.propsAvailable).toBe(true)
    expect(output.omittedValues).toBeGreaterThan(0)
    expect(() => JSON.stringify(output)).not.toThrow()
    expect(projectVariantState({ count: 0 }).propsAvailable).toBe(false)
  })

  it('normalizes refs and omits accessors through generated MCP state inspection', async () => {
    const getter = vi.fn(() => 'private')
    const derived = vi.fn(() => 4)
    const source: Record<string, unknown> = { label: ref('Save'), count: ref(3), derived: computed(derived) }
    Object.defineProperty(source, 'computed', { enumerable: true, get: getter })
    const targetVariant = { id: 'variant', state: reactive(source) }
    const messages: Record<string, unknown>[] = []
    const runtimeGet = vi.fn(() => ({ sdk: true }))
    const createRuntimeState = vi.fn(() => ({ get: runtimeGet }))
    const generated = previewRuntimeService()
    const dependencies = {
      window: { location: { search: '?mcpNonce=nonce&mcpEpoch=epoch' }, addEventListener: vi.fn() },
      story: { value: { id: 'story' } },
      variant: { value: targetVariant },
      initialSelection: { controls: false },
      histoireConfig: {},
      getVariantById: (id: string) => id === 'variant' ? targetVariant : undefined,
      readyVariantIds: new Set(['variant']),
      createRuntimeState,
      toRawDeep: vi.fn(() => {
        throw new Error('SDK serializer must not run')
      }),
      createRuntimeStatePresets: vi.fn(),
      createStandalonePresetStorage: vi.fn(),
      getDynamicSourceCode: vi.fn(),
      serializeTestError: (error: Error) => ({ message: error.message }),
      observeRuntimeLayout: () => ({ refresh() {}, close() {} }),
      installRuntimeHostChannels: () => ({ receive() {}, close() {} }),
      installRuntimeEventScope: () => () => {},
      postToParent: (message: Record<string, unknown>) => messages.push(message),
      RUNTIME_RESULT: '__histoire:runtime-result',
      previewDocumentId: 'document',
    }
    // eslint-disable-next-line no-new-func -- executes emitted preview service with finite local dependencies
    const service = new Function(...Object.keys(dependencies), `${generated}\nreturn { handleRuntimeRequest }`)(...Object.values(dependencies)) as { handleRuntimeRequest: (message: Record<string, unknown>) => Promise<void> }

    for (const request of [
      { documentId: 'wrong', mcpNonce: 'nonce', mcpEpoch: 'epoch', storyId: 'story', variantId: 'variant' },
      { documentId: 'document', mcpNonce: 'wrong', mcpEpoch: 'epoch', storyId: 'story', variantId: 'variant' },
      { documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'wrong', storyId: 'story', variantId: 'variant' },
      { documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'epoch', storyId: 'wrong', variantId: 'variant' },
      { documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'epoch', storyId: 'story', variantId: 'wrong' },
    ]) {
      await service.handleRuntimeRequest({ command: 'state.get', inspection: true, requestId: 'wrong-authority', ...request })
    }
    expect(messages).toEqual([])

    await service.handleRuntimeRequest({ command: 'state.get', inspection: true, requestId: 'inspection', documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'epoch', storyId: 'story', variantId: 'variant' })

    expect(createRuntimeState).not.toHaveBeenCalled()
    expect(getter).not.toHaveBeenCalled()
    expect(derived).not.toHaveBeenCalled()
    expect(messages.at(-1)).toMatchObject({ result: { state: { label: 'Save', count: 3 }, omittedValues: expect.any(Number), truncated: true } })
    expect((messages.at(-1) as any).result.state).not.toHaveProperty('computed')
    expect((messages.at(-1) as any).result.state).not.toHaveProperty('derived')

    await service.handleRuntimeRequest({ command: 'state.get', requestId: 'sdk', storyId: 'story', variantId: 'variant' })
    expect(createRuntimeState).toHaveBeenCalledOnce()
    expect(runtimeGet).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({ result: { sdk: true } })
  })

  it('reports clipped component metadata', () => {
    const output = projectVariantState({
      _hPropDefs: [{ name: 'Component'.repeat(40), index: 0, props: [{ name: 'mode', types: Array.from({ length: 17 }, () => 'string'), values: Array.from({ length: 101 }, (_, index) => index) }] }],
    })
    expect(output.components[0]).toMatchObject({ name: 'Component'.repeat(32).slice(0, 256), props: [{ name: 'mode', types: Array.from({ length: 16 }).fill('string'), values: Array.from({ length: 100 }, (_, index) => index) }] })
    expect(output).toMatchObject({ omittedValues: 3, truncated: true })
  })

  it('marks clipped prop type strings', () => {
    const output = projectVariantState({
      _hPropDefs: [{ name: 'Component', index: 0, props: [{ name: 'mode', types: ['x'.repeat(129)] }] }],
    })
    expect(output).toMatchObject({ components: [{ props: [{ types: ['x'.repeat(128)] }] }], omittedValues: 1, truncated: true })
  })

  it('stops metadata traversal after its pre-transfer budget is exhausted', () => {
    const type = 'x'.repeat(128)
    const prop = { name: 'mode', types: Array.from({ length: 16 }, () => type) }
    const later = new Proxy({ name: 'later', index: 1, props: [] }, {
      getOwnPropertyDescriptor(target, name) {
        throw new Error(`Unexpected metadata visit: ${String(name)}`)
      },
    })
    const output = projectVariantState({
      _hPropDefs: [{ name: 'first', index: 0, props: Array.from({ length: 100 }, () => prop) }, later],
    })
    expect(output.components[0].props.length).toBeGreaterThan(0)
    expect(output.components[0].props.length).toBeLessThan(100)
    expect(output).toMatchObject({ truncated: true })
  })

  it('bounds DOM traversal and omits scripts, form values and sensitive attributes', () => {
    const dom = new JSDOM('<body><section id="root"><button aria-label="Save">Save</button><input type="password" value="secret"><textarea>secret textarea</textarea><script>secretScript()</script><a href="https://example.com/?token=secret" onclick="secret()">Open</a><div><span>Nested</span></div></section></body>')
    try {
      const result = inspectDomDocument({ selector: '#root', maxNodes: 10, maxDepth: 8 }, dom.window.document)
      expect(result.matched).toBe(true)
      expect(result.nodes.map(node => node.tag)).not.toContain('script')
      expect(result.nodes.find(node => node.tag === 'button')?.attributes['aria-label']).toBe('Save')
      expect(JSON.stringify(result)).not.toContain('secret')
      expect(result.nodes[1].parentIndex).toBe(0)
      expect(inspectDomDocument({ selector: '#root', maxNodes: 1, maxDepth: 8 }, dom.window.document)).toMatchObject({ truncated: true, nodes: [{ tag: 'section' }] })
      expect(inspectDomDocument({ selector: '#missing', maxNodes: 10, maxDepth: 8 }, dom.window.document)).toMatchObject({ matched: false, nodes: [] })
      expect(() => inspectDomDocument({ selector: '[', maxNodes: 10, maxDepth: 8 }, dom.window.document)).toThrow()
    }
    finally { dom.window.close() }
  })

  it('stops sibling traversal after a rejected byte-budget row and marks style clipping', () => {
    const dom = new JSDOM(`<body><section id="root">${Array.from({ length: 1000 }, () => `<span>${'text'.repeat(250)}</span>`).join('')}</section></body>`)
    try {
      const getComputedStyle = vi.fn(() => ({ fontFamily: 'style'.repeat(200) }))
      Object.defineProperty(dom.window, 'getComputedStyle', { configurable: true, value: getComputedStyle })
      const result = inspectDomDocument({ selector: '#root', maxNodes: 500, maxDepth: 2 }, dom.window.document)
      expect(result).toMatchObject({ truncated: true })
      expect(result.nodes[0].styles.fontFamily).toHaveLength(512)
      expect(getComputedStyle).toHaveBeenCalledTimes(result.nodes.length + 1)
    }
    finally { dom.window.close() }
  })

  it('marks clipped DOM tag names', () => {
    const tag = `x-${'long'.repeat(40)}`
    const dom = new JSDOM(`<body><${tag} id="root"></${tag}></body>`)
    try {
      const result = inspectDomDocument({ selector: '#root', maxNodes: 1, maxDepth: 0 }, dom.window.document)
      expect(result).toMatchObject({ truncated: true, nodes: [{ tag: tag.slice(0, 128) }] })
    }
    finally { dom.window.close() }
  })

  it('bounds diagnostics, sanitizes known credentials and strips network query strings', () => {
    const listeners = new Map<string, (...args: any[]) => void>()
    const page = { on: vi.fn((name, listener) => listeners.set(name, listener)), off: vi.fn() }
    const observer = createInspectionDiagnostics({ root: '/private/project', secret: 'token-secret' })
    observer.attach(page as any)
    listeners.get('console')!({ type: () => 'error', text: () => '/private/project token-secret' })
    listeners.get('response')!({ status: () => 404, url: () => 'https://user:password@example.com/missing?token=secret#fragment' })
    for (let index = 0; index < 110; index++) listeners.get('pageerror')!(new Error('broken'))
    const snapshot = observer.snapshot()
    expect(snapshot.entries).toHaveLength(100)
    expect(snapshot.droppedCount).toBeGreaterThan(0)
    expect(snapshot.entries[0].message).toBe('[project] [redacted]')
    expect(snapshot.entries[1].url).toBe('https://example.com/missing')
    observer.close()
    expect(page.off).toHaveBeenCalledTimes(4)
  })

  it('budgets complete results including escaped IDs and preserves exact identities', () => {
    const storyId = '\u0001'.repeat(2048)
    const variantId = '\u0002'.repeat(2048)
    const result = boundInspectionResult({ storyId, variantId, inspection: 'accessibility', viewport: { width: 1280, height: 800 }, snapshot: '\u0003'.repeat(32768), totalCharacters: 32768, matched: true, truncated: false })
    expect(result).toMatchObject({ storyId, variantId, truncated: true })
    expect(mcpInspectionResultSchema.safeParse(result).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(60 * 1024)
  })

  it('discards inspection from replaced document and releases owned browser', async () => {
    const fixture = createPreviewBrowserFixture()
    let inspected = false
    fixture.frame.evaluate.mockImplementation(async (_callback, options) => {
      if (options && typeof options === 'object') inspected = true
      return (typeof options === 'string' ? true : { matched: true, nodes: [], truncated: false }) as never
    })
    fixture.page.evaluate.mockImplementation(async (_callback, expected) => expected ? !inspected : 'document')
    const execution = createExecutionService()
    const input = mcpToolInputSchemas.histoire_inspect_dom.parse({ storyId: 'story', variantId: 'variant', requestKey: 'inspect' })
    try {
      await expect(execution.enqueue(createInspectionTask('inspect-dom', input, fixture.session)).result).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
      expect(fixture.close).toHaveBeenCalledOnce()
      expect(execution.available).toBe(true)
    }
    finally { await execution.close() }
  })

  it('retains mount failure evidence and releases browser lane for diagnostics', async () => {
    const fixture = createPreviewBrowserFixture()
    fixture.page.goto.mockImplementation(async () => {
      // Both telemetry and session ownership observe the same real page error.
      for (const [name, listener] of fixture.page.on.mock.calls) {
        if (name === 'pageerror') listener(new Error('mount failure'))
      }
      throw new Error('Page closed after mount failure')
    })
    const execution = createExecutionService()
    const input = mcpToolInputSchemas.histoire_get_runtime_diagnostics.parse({ storyId: 'story', variantId: 'variant', requestKey: 'diagnostics' })
    try {
      const output = await execution.enqueue(createInspectionTask('runtime-diagnostics', input, fixture.session)).result
      expect(output.result).toMatchObject({ inspection: 'diagnostics', previewReady: false, readinessError: 'Preview page failed', entries: [{ kind: 'page-error', message: 'mount failure' }] })
      expect(fixture.close).toHaveBeenCalledOnce()
      expect(execution.available).toBe(true)
    }
    finally { await execution.close() }
  })
})

// @vitest-environment jsdom
import { TEST_CASE_RESULT, VARIANT_READY } from '@histoire/protocol'
import { expect, it, vi } from 'vitest'
import { createEmbedTestWorkers } from '../../../../../histoire-app/src/embed/adapters/test-workers.js'

/** Delivers one exact hidden-frame protocol message to the host window. */
function deliver(frame: HTMLIFrameElement, type: string, payload: Record<string, unknown>) {
  const documentId = new URL(frame.src).searchParams.get('documentId')!
  window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    origin: window.location.origin,
    data: {
      __histoire: true,
      type,
      documentId,
      storyId: 'story',
      variantId: 'variant',
      ...payload,
    },
  }))
}

/** Builds the one-case summary normally produced by the hidden runtime. */
function passed(id: string) {
  return {
    ok: true,
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    errors: [],
    tests: [{ id, name: id, fullName: id, state: 'passed' as const, errors: [], storyId: 'story', variantId: 'variant' }],
  }
}

it('limits hidden in-book test documents and schedules the next case after cleanup', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  let nextDocument = 0
  const workers = createEmbedTestWorkers({
    container,
    maxWorkers: 2,
    timeoutMs: 1_000,
    createDocumentId: () => `document-${++nextDocument}`,
    createUrl: (_target, documentId) => `http://localhost/__sandbox.html?documentId=${documentId}`,
  })
  const controller = new AbortController()
  const capture = { signal: controller.signal, target: { storyId: 'story', variantId: 'variant' } } as any
  const definitions = ['one', 'two', 'three'].map(id => ({ id, name: id, fullName: id }))

  try {
    const running = workers.run(capture, definitions)
    await vi.waitFor(() => expect(container.querySelectorAll('iframe')).toHaveLength(2))
    const [first, second] = Array.from(container.querySelectorAll('iframe'))

    deliver(first, VARIANT_READY, {})
    deliver(second, VARIANT_READY, {})
    deliver(first, TEST_CASE_RESULT, { runId: 'document-1:test:1', definition: definitions[0], summary: passed('one') })
    await vi.waitFor(() => expect(container.querySelectorAll('iframe')).toHaveLength(2))
    const third = Array.from(container.querySelectorAll('iframe')).find(frame => frame !== second)!

    deliver(second, TEST_CASE_RESULT, { runId: 'document-2:test:2', definition: definitions[1], summary: passed('two') })
    deliver(third, VARIANT_READY, {})
    deliver(third, TEST_CASE_RESULT, { runId: 'document-3:test:3', definition: definitions[2], summary: passed('three') })

    await expect(running).resolves.toMatchObject({ passed: 3, failed: 0, tests: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] })
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
  }
  finally {
    workers.close()
    container.remove()
  }
})

it('cancels active hidden documents without scheduling queued cases', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  let nextDocument = 0
  const workers = createEmbedTestWorkers({
    container,
    maxWorkers: 1,
    timeoutMs: 1_000,
    createDocumentId: () => `document-${++nextDocument}`,
    createUrl: (_target, documentId) => `http://localhost/__sandbox.html?documentId=${documentId}`,
  })
  const capture = { signal: new AbortController().signal, target: { storyId: 'story', variantId: 'variant' } } as any

  try {
    const running = workers.run(capture, ['one', 'two'].map(id => ({ id, name: id, fullName: id })))
    await vi.waitFor(() => expect(container.querySelectorAll('iframe')).toHaveLength(1))

    workers.cancel()

    await expect(running).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
    expect(nextDocument).toBe(1)
  }
  finally {
    workers.close()
    container.remove()
  }
})

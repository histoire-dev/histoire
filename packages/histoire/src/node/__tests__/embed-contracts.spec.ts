import { describe, expect, it } from 'vitest'
import * as protocol from '../../../../histoire-protocol/dist/index.js'
import * as url from '../../../../histoire-shared/src/preview-url.js'
import * as state from '../../../../histoire-shared/src/serialized-state.js'
import { createFailedRunSummary } from '../../../../histoire-shared/src/test-results.js'
import * as preview from '../../../../histoire-shared/src/types/preview-message.js'
import { createEmbedCyclicState } from './utils/embed/state.js'
import { createEmbedPortPair } from './utils/embed/transport.js'

describe('embed foundation compatibility', () => {
  it('re-exports canonical protocol constants, URL and state helpers by identity', () => {
    expect(preview.STATE_SYNC).toBe(protocol.STATE_SYNC)
    expect(url.getSandboxRelativeUrl).toBe(protocol.getSandboxRelativeUrl)
    expect(url.normalizePreviewBase).toBe(protocol.normalizePreviewBase)
    expect(state.applySerializedState).toBe(protocol.applySerializedState)
    expect(url.getSandboxRelativeUrl({ base: '/book/', storyId: 'a:b', variantId: 'c/d' })).toBe('/book/__sandbox.html?storyId=a%3Ab&variantId=c%2Fd')
  })

  it('clones cyclic transport values and prevents queued delivery after close', async () => {
    const pair = createEmbedPortPair()
    const received: unknown[] = []
    pair.child.addEventListener('message', event => received.push(event.data))
    pair.child.start()
    const cycle = createEmbedCyclicState()
    pair.parent.postMessage(cycle)
    await Promise.resolve()
    expect((received[0] as any).self).toBe(received[0])
    expect(received[0]).not.toBe(cycle)
    pair.parent.postMessage('late')
    pair.child.close()
    pair.parent.close()
    await Promise.resolve()
    expect(received).toHaveLength(1)
    expect(pair.child.isClosed()).toBe(true)
  })

  it('keeps existing failed-run serialization JSON-safe for outer bridge', () => {
    const summary = createFailedRunSummary('a:b', 'c', new Error('assertion failed'))
    expect(() => protocol.validateBridgeResult('tests.run', summary)).not.toThrow()
    expect(summary).toMatchObject({ ok: false, failed: 1, tests: [{ storyId: 'a:b', variantId: 'c' }] })
  })
})

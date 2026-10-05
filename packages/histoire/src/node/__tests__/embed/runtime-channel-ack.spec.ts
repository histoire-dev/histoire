import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import { expect, it, vi } from 'vitest'
import { createRuntimeRequests } from '../../../../../histoire-app/src/embed/adapters/runtime-requests.js'

it('preserves null runtime channel acknowledgement instead of fabricating test definitions', async () => {
  const post = vi.fn()
  const requests = createRuntimeRequests(post, 1000)
  const capture: HistoireRequestCapture = { sessionId: 'session', connectionId: 'connection', sourceId: 'source', epoch: 'epoch', revision: 'revision', mountId: 'mount', runtimeId: 'document', target: { storyId: 'book', variantId: 'one' }, signal: new AbortController().signal }
  const pending = requests.request('runtime', { command: 'channel.post', payload: { name: 'factory', type: 'application', data: null } }, capture)
  requests.receive({ requestId: post.mock.calls[0][0].requestId, result: null })
  await expect(pending).resolves.toBeNull()
  requests.invalidate()
})

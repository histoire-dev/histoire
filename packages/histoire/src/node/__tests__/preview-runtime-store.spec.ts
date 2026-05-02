import fs from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'

describe('preview runtime store frame abort', () => {
  const storePath = resolve(process.cwd(), '../histoire-app/src/app/stores/preview-runtime.ts')
  const source = fs.readFileSync(storePath, 'utf8')

  it('aborts pending collection and run requests when the last iframe detaches', () => {
    expect(source).toContain('function abortPendingRequests')
    expect(source).toContain('if (frame === null && !getCurrentFrame())')
    expect(source).toContain('abortPendingRequests(\'Preview iframe was detached before completing the request.\')')
  })

  it('clears pending request slots before rejecting so the next call can start', () => {
    // Ordering matters: null the pending slot first so the rejection handler
    // does not see itself as the active in-flight request.
    expect(source).toMatch(/pendingCollection = null\s+aborted\.reject/)
    expect(source).toMatch(/pendingRun = null\s+aborted\.reject/)
  })
})

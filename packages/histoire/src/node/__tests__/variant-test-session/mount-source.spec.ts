import { describe, expect, it } from 'vitest'
import { readNodeSources } from '../utils/node-source.js'

/**
 * Source-level guard, deliberately NOT behavioral.
 *
 * `mountRenderVariant` mounts a real Vue app built from `@histoire/app`'s
 * BUILT bundle (`dist/bundled/...`) into a live `document`, so driving it would
 * require both a DOM environment and a prior build of another package — neither
 * of which this Node suite has. The timer-leak invariant is therefore pinned at
 * the source level, over the whole `virtual` sub-tree rather than one path, so
 * moving or splitting the mount module cannot silently disable it.
 */
describe('mountRenderVariant render-timeout cleanup', () => {
  it('captures the timeout handle and clears it in a finally', () => {
    const source = readNodeSources('virtual')

    // The setTimeout result is assigned (captured), not discarded — otherwise
    // every successful mount leaves a dangling 15s timer alive.
    expect(source).toMatch(/timeoutHandle\s*=\s*setTimeout\(/)
    // The handle is cleared in a finally so both the ready and timeout paths
    // tear the timer down.
    expect(source).toMatch(/finally\s*\{[\s\S]*clearTimeout\(timeoutHandle\)/)
  })

  it('takes the mount timeout from the variant session options', () => {
    const source = readNodeSources('virtual')

    expect(source).toContain('mountTimeoutMs')
    expect(source).not.toContain('const RENDER_TIMEOUT = 15_000')
  })
})

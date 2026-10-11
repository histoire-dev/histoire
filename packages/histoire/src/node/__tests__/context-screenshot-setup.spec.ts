import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContext } from '../context.js'
import { getContextScreenshotSetup } from '../runtime/registry.js'
import { createMcpContext, createMcpProjectFixture } from './utils/mcp/project.js'

const close: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.allSettled(close.splice(0).reverse().map(dispose => dispose()))
})

describe('context screenshot setup ownership', () => {
  it('reuses one owner for a Context and closes it with that Context', async () => {
    const fixture = await createMcpProjectFixture()
    close.push(fixture.close)
    const context = createMcpContext(fixture.root)
    const owner = getContextScreenshotSetup(context, () => true)
    const closeOwner = vi.spyOn(owner, 'close')

    expect(getContextScreenshotSetup(context, () => false)).toBe(owner)
    await closeContext(context)
    await closeContext(context)

    expect(closeOwner).toHaveBeenCalledOnce()
  })
})

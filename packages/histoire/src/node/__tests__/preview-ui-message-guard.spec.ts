import { describe, expect, it } from 'vitest'
import { createPreviewRuntime } from './utils/preview-runtime-message.js'

describe('preview UI operation authority', () => {
  it.each(['__histoire:measure-request', '__histoire:element-pick-request', '__histoire:props-override'])('rejects foreign or stale %s before DOM or state access', async (type) => {
    const runtime = createPreviewRuntime()
    const message = { __histoire: true, type, storyId: 'story-a', variantId: 'variant-a', documentId: 'document', x: 10, y: 10, props: {} }
    await runtime.deliver(message, { source: {} })
    await runtime.deliver(message, { origin: 'https://foreign.test' })
    await runtime.deliver({ ...message, __histoire: false })
    await runtime.deliver({ ...message, documentId: 'old' })
    await runtime.deliver({ ...message, storyId: 'old' })
    await runtime.deliver({ ...message, variantId: 'old' })
    await runtime.deliver({ ...message, requestId: 'x'.repeat(201) })
    await runtime.deliver({ ...message, requestId: {} })
    expect(runtime.handleElementInspection).not.toHaveBeenCalled()
    expect(runtime.applyPropsOverride).not.toHaveBeenCalled()
    await runtime.deliver(message)
    if (type === '__histoire:props-override') expect(runtime.applyPropsOverride).toHaveBeenCalledWith(message)
    else expect(runtime.handleElementInspection).toHaveBeenCalledWith(message, { storyId: 'story-a', variantId: 'variant-a' })
  })

  it('prevents controls replica from inspecting content or applying matrix props', async () => {
    const runtime = createPreviewRuntime({ controls: true })
    for (const type of ['__histoire:measure-request', '__histoire:element-pick-request', '__histoire:props-override']) {
      await runtime.deliver({ __histoire: true, type, variantId: 'variant-a', x: 10, y: 10, props: {} })
    }
    expect(runtime.handleElementInspection).not.toHaveBeenCalled()
    expect(runtime.applyPropsOverride).not.toHaveBeenCalled()
  })
})

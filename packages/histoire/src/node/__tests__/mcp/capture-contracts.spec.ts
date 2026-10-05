import { describe, expect, it, vi } from 'vitest'
import { requestFingerprint } from '../../mcp/operations/admission.js'
import { mcpScreenshotResultSchema } from '../../mcp/protocol/operation-schema.js'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'
import { operationFixture } from '../utils/mcp/operations.js'

/** One exact tuple reused across strict capture admission checks. */
const target = { storyId: 'story', variantId: 'variant', requestKey: 'capture' }
const schema = mcpToolInputSchemas.histoire_capture_screenshot

describe('deterministic capture contracts', () => {
  it('accepts bounded device scale and shared primitive globals only', () => {
    expect(schema.parse(target).deviceScaleFactor).toBe(1)
    expect(schema.parse({ ...target, deviceScaleFactor: 3, globals: { theme: 'contrast', enabled: true, count: 2, empty: null } }).globals).toEqual({ theme: 'contrast', enabled: true, count: 2, empty: null })
    for (const deviceScaleFactor of [0, 4, 1.5, Number.NaN, Infinity]) {
      expect(schema.safeParse({ ...target, deviceScaleFactor }).success).toBe(false)
    }
    for (const globals of [{ 'bad key': 'x' }, { theme: {} }, { theme: ['x'] }, { theme: 'x'.repeat(1025) }, { theme: Infinity }, Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key${index}`, index]))]) {
      expect(schema.safeParse({ ...target, globals }).success).toBe(false)
    }
  })

  it('normalizes globals order and default DPR before retry reconciliation', () => {
    const first = schema.parse({ ...target, globals: { theme: 'contrast', count: 2 } })
    const reordered = schema.parse({ ...target, deviceScaleFactor: 1, colorScheme: undefined, globals: { count: 2, theme: 'contrast' } })
    expect(requestFingerprint('screenshot', first)).toBe(requestFingerprint('screenshot', reordered))
    expect(requestFingerprint('screenshot', first)).not.toBe(requestFingerprint('screenshot', schema.parse({ ...first, deviceScaleFactor: 2 })))
  })

  it('captures globals before callers can mutate admitted settings', () => {
    const input = { ...target, globals: { theme: 'contrast' } }
    const parsed = schema.parse(input)
    input.globals.theme = 'light'
    expect(parsed.globals).toEqual({ theme: 'contrast' })
  })

  it('rejects malformed capture before executor admission', async () => {
    const { operations } = operationFixture()
    const executor = vi.fn()
    operations.registerExecutor('screenshot', executor)
    expect(() => operations.admit('alice', 'screenshot', { ...target, deviceScaleFactor: 4 } as any)).toThrow()
    expect(() => operations.admit('alice', 'screenshot', { ...target, globals: { theme: {} } } as any)).toThrow()
    expect(executor).not.toHaveBeenCalled()
    await operations.close()
  })

  it('bounds decoded PNG pixels independently of byte cap', () => {
    const result = { storyId: 'story', variantId: 'variant', width: 11520, height: 6480, mimeType: 'image/png', bytes: 512, sha256: 'a'.repeat(64), artifactUri: '' }
    expect(mcpScreenshotResultSchema.parse(result)).toEqual(result)
    expect(mcpScreenshotResultSchema.safeParse({ ...result, width: 11521 }).success).toBe(false)
    expect(mcpScreenshotResultSchema.safeParse({ ...result, bytes: 4 * 1024 * 1024 + 1 }).success).toBe(false)
  })
})

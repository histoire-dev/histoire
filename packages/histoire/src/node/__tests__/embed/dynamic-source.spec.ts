import { describe, expect, it, vi } from 'vitest'
import { getDynamicSourceCode } from '../../../../../histoire-app/src/app/util/dynamic-source.js'

describe('canonical dynamic source choices', () => {
  it('preserves explicit and source-slot precedence before support-plugin generator', async () => {
    const generate = vi.fn().mockResolvedValue('<Generated/>')
    expect(await getDynamicSourceCode({ source: '<Explicit/>', slots: () => ({ source: () => [{ children: '  <Slot/>' }] }) } as any, generate)).toEqual({ body: '<Explicit/>', origin: 'explicit' })
    expect(await getDynamicSourceCode({ slots: () => ({ source: () => [{ children: '\n  <Slot/>\n' }] }) } as any, generate)).toEqual({ body: '<Slot/>', origin: 'slot' })
    expect(generate).not.toHaveBeenCalled()
    expect(await getDynamicSourceCode({} as any, generate)).toEqual({ body: '<Generated/>', origin: 'generated' })
  })

  it('distinguishes absent generation, intentional empty source, and generator failure', async () => {
    expect(await getDynamicSourceCode({} as any)).toBeNull()
    expect(await getDynamicSourceCode({ source: '' } as any)).toEqual({ body: '', origin: 'explicit' })
    expect(await getDynamicSourceCode({} as any, async () => undefined)).toBeNull()
    await expect(getDynamicSourceCode({} as any, async () => {
      throw new Error('generator broke')
    })).rejects.toThrow('generator broke')
  })
})

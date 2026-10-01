import { describe, expect, it, vi } from 'vitest'
import { loadStoryVitestShim } from './utils/story-vitest-shim.js'

describe('story Vitest polling', () => {
  it.each(['waitFor', 'waitUntil'] as const)('bounds pending %s callbacks by the requested timeout', async (method) => {
    const shim = await loadStoryVitestShim()
    const callback = vi.fn(() => new Promise(resolve => setTimeout(() => resolve(true), 50)))

    await expect(shim.vi[method](callback, { timeout: 5, interval: 1 })).rejects.toThrow(`Timed out in ${method}!`)
    expect(callback).toHaveBeenCalledOnce()
  })

  it.each(['throw', 'reject'] as const)('stops waitUntil immediately when its callback uses %s', async (mode) => {
    const shim = await loadStoryVitestShim()
    const error = new Error('condition failed')
    const callback = vi.fn().mockImplementationOnce(() => {
      if (mode === 'reject') return Promise.reject(error)
      throw error
    }).mockReturnValue(true)

    await expect(shim.vi.waitUntil(callback, { interval: 1 })).rejects.toBe(error)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('retries waitFor errors and accepts a falsy successful result', async () => {
    const shim = await loadStoryVitestShim()
    const callback = vi.fn().mockRejectedValueOnce(new Error('not ready')).mockResolvedValue(false)

    await expect(shim.vi.waitFor(callback, { interval: 1 })).resolves.toBe(false)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('retries waitUntil falsy results until the condition becomes truthy', async () => {
    const shim = await loadStoryVitestShim()
    const callback = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(0).mockResolvedValue('ready')

    await expect(shim.vi.waitUntil(callback, { interval: 1 })).resolves.toBe('ready')
    expect(callback).toHaveBeenCalledTimes(3)
  })
})

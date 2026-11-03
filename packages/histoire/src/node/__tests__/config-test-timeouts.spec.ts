import type { Context } from '../context.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../config/defaults.js'
import { processConfig } from '../config/process.js'
import { DEFAULT_RUN_STALL_TIMEOUT, getRunStallTimeout } from '../util/test-timeouts.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('test run stall timeout', () => {
  it('defaults when unset', async () => {
    const ctx = { config: getDefaultConfig(), root: '/tmp' } as Context
    await processConfig(ctx)
    expect(getRunStallTimeout(ctx)).toBe(DEFAULT_RUN_STALL_TIMEOUT)
  })

  it('accepts the deprecated runTimeout with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = { config: getDefaultConfig(), root: '/tmp' } as Context
    ctx.config.test = { ...ctx.config.test, runTimeout: 900_000 }
    await processConfig(ctx)
    expect(getRunStallTimeout(ctx)).toBe(900_000)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test.runStallTimeout'))
  })

  it('prefers runStallTimeout over the deprecated option', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = { config: getDefaultConfig(), root: '/tmp' } as Context
    ctx.config.test = { ...ctx.config.test, runTimeout: 900_000, runStallTimeout: 60_000 }
    await processConfig(ctx)
    expect(getRunStallTimeout(ctx)).toBe(60_000)
  })
})

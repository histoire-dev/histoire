import { describe, expect, it } from 'vitest'
import { validateBridgeEventPayload } from '../bridge/events.js'
import { createHostChannelRateLimiter, validateHostChannelNames, validateHostChannelPayload } from '../channels.js'

describe('opt-in bounded application channels', () => {
  it('rejects non-JSON values and counts UTF-8 bytes without invoking accessors', () => {
    expect(validateHostChannelPayload({ name: 'factory', type: 'pick', data: { selected: null } }).data).toEqual({ selected: null })
    for (const data of [undefined, () => {}, new Date(), { bad: Infinity }, { bad: undefined }]) {
      expect(() => validateHostChannelPayload({ name: 'factory', type: 'pick', data })).toThrow()
    }
    const cyclic: any = {}
    cyclic.self = cyclic
    expect(() => validateHostChannelPayload({ name: 'factory', type: 'pick', data: cyclic })).toThrow()
    expect(() => validateHostChannelPayload({ name: 'factory', type: 'pick', data: '😀'.repeat(20_000) })).toThrowError(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
    expect(() => validateBridgeEventPayload('channel.message', { name: 'factory', type: 'pick', data: null })).toThrow()
  })

  it('validates names once and forbids ambient authority in payload fields', () => {
    expect(validateHostChannelNames(['factory', 'factory', 'a-1'])).toEqual(['factory', 'a-1'])
    for (const value of ['*', ['Factory'], ['a'.repeat(33)], [''], ['a/b']]) expect(() => validateHostChannelNames(value)).toThrow()
    expect(() => validateHostChannelPayload({ name: 'factory', type: 'pick', data: null, command: 'selection.select' })).toThrow()
  })

  it('bounds both sliding-window retention and dropped count without scheduling work', () => {
    let now = 0
    const rate = createHostChannelRateLimiter(() => now)
    for (let index = 0; index < 50; index++) expect(rate.accept()).toBe(true)
    for (let index = 0; index < 70; index++) expect(rate.accept()).toBe(false)
    expect(rate.droppedCount).toBe(70)
    now = 999
    expect(rate.accept()).toBe(false)
    now = 1000
    expect(rate.accept()).toBe(true)
    rate.reset()
    expect(rate.droppedCount).toBe(0)
  })
})

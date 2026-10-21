import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSandboxBootGate } from '../../../histoire-app/src/app/components/canvas/sandbox-boot-gate.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('sandbox boot gate', () => {
  it('boots the first document of a burst alone, then releases every follower together', async () => {
    const gate = createSandboxBootGate()
    const leader = await gate.enter(new AbortController().signal)
    const followers: string[] = []
    const first = gate.enter(new AbortController().signal).then(() => followers.push('first'))
    const second = gate.enter(new AbortController().signal).then(() => followers.push('second'))
    await flushPromises()
    expect(followers).toEqual([])

    leader()
    await Promise.all([first, second])
    expect(followers).toEqual(['first', 'second'])
  })

  it('stages the next burst behind a new leader', async () => {
    const gate = createSandboxBootGate()
    ;(await gate.enter(new AbortController().signal))()
    const nextLeader = await gate.enter(new AbortController().signal)
    let followed = false
    const follower = gate.enter(new AbortController().signal).then(() => {
      followed = true
    })
    await flushPromises()
    expect(followed).toBe(false)

    nextLeader()
    await follower
    expect(followed).toBe(true)
  })

  it('stops waiting when a follower is cancelled or the leader takes too long', async () => {
    vi.useFakeTimers()
    const gate = createSandboxBootGate(1000)
    await gate.enter(new AbortController().signal)
    const controller = new AbortController()
    const cancelled = gate.enter(controller.signal)
    controller.abort()
    await expect(cancelled).rejects.toThrow()

    let released = false
    const late = gate.enter(new AbortController().signal).then(() => {
      released = true
    })
    await vi.advanceTimersByTimeAsync(1000)
    await late
    expect(released).toBe(true)
  })
})

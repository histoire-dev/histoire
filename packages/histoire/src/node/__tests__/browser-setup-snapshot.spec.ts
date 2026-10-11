import type { ScreenshotSetupAttempt, ScreenshotSetupSnapshot } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { addSetupAttempt, copySetupAttempts, detachSetupSnapshot } from '../runtime/browser/setup/snapshot.js'

describe('browser setup snapshot copies', () => {
  it('detaches nested driver and diagnostic fields from observers and source attempts', () => {
    const attempt: ScreenshotSetupAttempt = {
      source: 'headless-shell',
      reason: 'system-dependencies',
      stage: 'launch',
      driver: { packageName: 'playwright-core', version: '1.59.1' },
      diagnostic: { code: 'missing-library', library: 'libnss3.so.1' },
    }
    const snapshot: ScreenshotSetupSnapshot = {
      revision: 2,
      state: 'needs-action',
      reason: 'system-dependencies',
      attempts: [attempt],
      repairs: [],
    }

    const attemptsCopy = copySetupAttempts([attempt])
    const snapshotCopy = detachSetupSnapshot(snapshot)
    const internalAttempts: ScreenshotSetupAttempt[] = []
    addSetupAttempt(internalAttempts, attempt)

    expect(attemptsCopy[0]).not.toBe(attempt)
    expect(attemptsCopy[0].driver).not.toBe(attempt.driver)
    expect(attemptsCopy[0].diagnostic).not.toBe(attempt.diagnostic)
    expect(snapshotCopy.attempts[0].driver).not.toBe(attempt.driver)
    expect(snapshotCopy.attempts[0].diagnostic).not.toBe(attempt.diagnostic)
    expect(internalAttempts[0].driver).not.toBe(attempt.driver)
    expect(internalAttempts[0].diagnostic).not.toBe(attempt.diagnostic)

    attempt.driver.version = '1.59.2'
    if (attempt.diagnostic?.code === 'missing-library') attempt.diagnostic.library = 'libchanged.so.2'
    expect(attemptsCopy[0].driver?.version).toBe('1.59.1')
    expect(snapshotCopy.attempts[0].driver?.version).toBe('1.59.1')
    expect(internalAttempts[0].driver?.version).toBe('1.59.1')
    expect(attemptsCopy[0].diagnostic).toEqual({ code: 'missing-library', library: 'libnss3.so.1' })
    expect(snapshotCopy.attempts[0].diagnostic).toEqual({ code: 'missing-library', library: 'libnss3.so.1' })
    expect(internalAttempts[0].diagnostic).toEqual({ code: 'missing-library', library: 'libnss3.so.1' })
  })
})

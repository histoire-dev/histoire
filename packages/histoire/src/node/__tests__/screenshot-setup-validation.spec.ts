import { describe, expect, it } from 'vitest'
import { screenshotSetupSnapshotSchema } from '../server/ui-channel/screenshot-setup-validation.js'

describe('portable screenshot setup validation', () => {
  it('keeps legacy attempts valid and accepts each bounded diagnostic variant', () => {
    const legacy = snapshotWithAttempt({ source: 'headless-shell', reason: 'startup-failed' })
    expect(screenshotSetupSnapshotSchema.parse(legacy)).toEqual(legacy)

    const diagnostics = [
      { code: 'process-exited', exitCode: 127, signal: 'SIGTERM' },
      { code: 'process-exited', exitCode: 3_221_225_477 },
      { code: 'process-exited', signal: 'SIGBREAK' },
      { code: 'missing-library', library: 'libnss3.so.1.0' },
      { code: 'executable-format' },
      { code: 'sandbox-denied' },
      { code: 'invalid-probe-image' },
      { code: 'protocol-error' },
      { code: 'unknown' },
    ] as const

    for (const diagnostic of diagnostics) {
      const attempt = {
        source: 'headless-shell',
        reason: 'startup-failed',
        stage: 'probe',
        driver: { packageName: 'playwright-core', version: '1.59.1' },
        diagnostic,
      }
      expect(screenshotSetupSnapshotSchema.parse(snapshotWithAttempt(attempt)).attempts).toEqual([attempt])
    }
  })

  it.each([
    { code: 'process-exited', exitCode: 1.5 },
    { code: 'process-exited', exitCode: 4_294_967_296 },
    { code: 'process-exited', signal: 'SIGNOTREAL' },
    { code: 'missing-library', library: '/usr/lib/libnss3.so.1' },
    { code: 'missing-library', library: 'libnss3.so.1/path' },
    { code: 'missing-library', library: `lib${'a'.repeat(124)}.so` },
    { code: 'unknown', message: 'raw browser log at /private/browser' },
  ] as const)('rejects unsafe or malformed setup diagnostic %#', (diagnostic) => {
    expect(() => screenshotSetupSnapshotSchema.parse(snapshotWithAttempt({
      source: 'headless-shell',
      reason: 'startup-failed',
      stage: 'probe',
      diagnostic,
    }))).toThrow()
  })

  it.each([
    { packageName: 'playwright', version: 'not-semver' },
    { packageName: 'playwright', version: '/private/driver/index.js' },
    { packageName: 'playwright', version: `1.0.0-${'a'.repeat(60)}` },
    { packageName: 'playwright', version: '1.59.1', resolvedPath: '/private/driver/index.js' },
  ] as const)('rejects malformed or private setup driver identity %#', (driver) => {
    expect(() => screenshotSetupSnapshotSchema.parse(snapshotWithAttempt({
      source: 'headless-shell',
      reason: 'startup-failed',
      driver,
    }))).toThrow()
  })
})

/** Builds one minimal snapshot containing an arbitrary untrusted attempt. */
function snapshotWithAttempt(attempt: unknown) {
  return {
    revision: 1,
    state: 'needs-action',
    reason: 'startup-failed',
    attempts: [attempt],
    repairs: [],
  }
}

import { describe, expect, it, vi } from 'vitest'
import { reportInvalidScreenshotSetupArguments, validateScreenshotSetupArguments } from '../commands/screenshot-setup-args.js'

describe('screenshot setup arguments', () => {
  it('accepts only bounded setup options and rejects installer or browser passthrough flags', () => {
    expect(validateScreenshotSetupArguments(['--root=/work', '--check', '-c', 'histoire.config.ts', '--json'])).toBeUndefined()
    expect(validateScreenshotSetupArguments(['--install'])).toContain('Unknown')
    expect(validateScreenshotSetupArguments(['--', 'install', 'chromium'])).toContain('not accepted')
    expect(validateScreenshotSetupArguments(['--config'])).toContain('Missing value')
    expect(validateScreenshotSetupArguments(['project'])).toContain('Unknown')
  })

  it('prints one bounded JSON object for invalid arguments when JSON was requested', () => {
    let output = ''
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write)
    try {
      reportInvalidScreenshotSetupArguments(true)

      expect(JSON.parse(output)).toEqual({ error: { code: 'invalid', message: 'Invalid screenshot-setup arguments.' } })
      expect(output.trim().split('\n')).toHaveLength(1)
    }
    finally {
      write.mockRestore()
    }
  })
})

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reportInvalidScreenshotSetupArguments, screenshotSetupCommand, validateScreenshotSetupArguments } from '../commands/screenshot-setup.js'

const setupMocks = vi.hoisted(() => ({
  driverIdentity: vi.fn(),
  driver: vi.fn(),
  launch: vi.fn(),
}))

vi.mock('../runtime/browser/setup/driver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime/browser/setup/driver.js')>()
  return { ...actual, resolveBrowserSetupDriverIdentity: setupMocks.driverIdentity, resolveBrowserSetupDriver: setupMocks.driver }
})

const roots: string[] = []
const originalExitCode = process.exitCode

/** A public Playwright-shaped fake keeps package resolution at the SDK boundary. */
function availableDriver() {
  return {
    status: 'available',
    driver: {
      packageName: 'playwright',
      resolvedPath: '/external/playwright/index.mjs',
      version: '1.50.0',
      chromium: { launch: setupMocks.launch, executablePath: () => '/external/chromium' },
    },
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  setupMocks.launch.mockReset()
  setupMocks.driverIdentity.mockReset()
  setupMocks.driver.mockReset()
  process.exitCode = originalExitCode
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('screenshot setup command', () => {
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

  it('uses exit 2 and one JSON error object for an invalid project root', async () => {
    let output = ''
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write)
    try {
      const code = await screenshotSetupCommand({ root: join(tmpdir(), 'missing-histoire-project'), json: true })

      expect(code).toBe(2)
      expect(JSON.parse(output)).toEqual({ error: { code: 'invalid', message: 'Invalid screenshot setup root or configuration.' } })
      expect(output.trim().split('\n')).toHaveLength(1)
    }
    finally {
      write.mockRestore()
    }
  })

  it('loads only Histoire config, keeps metadata discovery launch-free, and writes one portable JSON object', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-screenshot-setup-cli-'))
    roots.push(root)
    await writeFile(join(root, 'fake-browser'), '')
    await writeFile(join(root, 'histoire.config.ts'), [
      'console.log(\'config console output must be suppressed\')',
      'process.stdout.write(\'config stream output must be suppressed\')',
      'export default { browser: { source: \'executable\', executablePath: \'./fake-browser\' } }',
    ].join('\n'))
    setupMocks.driverIdentity.mockResolvedValue({
      status: 'available',
      identity: { packageName: 'playwright', resolvedPath: '/external/playwright/index.mjs', version: '1.50.0', resolvedFrom: 'project' },
    })
    setupMocks.driver.mockResolvedValue(availableDriver())

    let output = ''
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write)
    try {
      const code = await screenshotSetupCommand({ root, config: 'histoire.config.ts', json: true })

      expect(code, output).toBe(0)
      const snapshot = JSON.parse(output)
      expect(snapshot).toMatchObject({ state: 'unverified', attempts: [] })
      expect(snapshot.repairs.every((repair: { id: string }) => !repair.id.startsWith('install-'))).toBe(true)
      expect(output.trim().split('\n')).toHaveLength(1)
      expect(output).not.toContain(root)
      expect(output).not.toContain('config console output')
      expect(output).not.toContain('config stream output')
      expect(setupMocks.launch).not.toHaveBeenCalled()
    }
    finally {
      write.mockRestore()
    }
  })

  it('shows a single driver repair without probing or offering a browser download', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-screenshot-setup-driver-'))
    roots.push(root)
    setupMocks.driver.mockResolvedValue({ status: 'missing', reason: 'driver-missing' })

    let output = ''
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write)
    try {
      const code = await screenshotSetupCommand({ root, json: true })
      const snapshot = JSON.parse(output)

      expect(code).toBe(1)
      expect(snapshot).toMatchObject({ state: 'needs-action', reason: 'driver-missing' })
      expect(snapshot.repairs).toEqual([expect.objectContaining({
        id: 'install-playwright',
        command: { executable: 'pnpm', args: ['add', '-D', 'playwright'] },
      })])
      expect(setupMocks.launch).not.toHaveBeenCalled()
      expect(output).not.toContain('chromium')
    }
    finally {
      write.mockRestore()
    }
  })

  it('shows only selected-driver headless-shell guidance after an explicit probe fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-screenshot-setup-check-'))
    roots.push(root)
    await writeFile(join(root, 'histoire.config.ts'), 'export default { browser: { source: \'headless-shell\' } }\n')
    setupMocks.driverIdentity.mockResolvedValue({
      status: 'available',
      identity: { packageName: 'playwright', resolvedPath: '/external/playwright/index.mjs', version: '1.50.0', resolvedFrom: 'project' },
    })
    setupMocks.driver.mockResolvedValue(availableDriver())
    setupMocks.launch.mockRejectedValue(new Error('browserType.launch: Executable doesn\'t exist at /private/browser'))

    let output = ''
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write)
    try {
      const code = await screenshotSetupCommand({ root, config: 'histoire.config.ts', check: true, json: true })
      const snapshot = JSON.parse(output)

      expect(code).toBe(1)
      expect(snapshot).toMatchObject({ state: 'needs-action', reason: 'browser-missing' })
      expect(snapshot.repairs).toEqual([expect.objectContaining({ id: 'install-shell', command: { executable: 'pnpm', args: ['exec', 'playwright', 'install', 'chromium', '--only-shell'] } })])
      expect(output).not.toContain('/private/browser')
      expect(output).not.toContain('--no-shell')
    }
    finally {
      write.mockRestore()
    }
  })
})

import type { Context } from '../context.js'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContext } from '../context.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { isScreenshotSetupResultWithinBudget, screenshotSetupRequestSchema, screenshotSetupSnapshotSchema } from '../server/ui-channel/screenshot-setup-validation.js'
import { registerScreenshotSetupChannel } from '../server/ui-channel/screenshot-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { uiChannelFixture } from './utils/ui-channel.js'

const setupMocks = vi.hoisted(() => ({
  driverIdentity: vi.fn(),
  driver: vi.fn(),
  launch: vi.fn(),
}))

vi.mock('../runtime/browser/setup/driver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime/browser/setup/driver.js')>()
  return {
    ...actual,
    resolveBrowserSetupDriverIdentity: setupMocks.driverIdentity,
    resolveBrowserSetupDriver: setupMocks.driver,
  }
})

const roots: string[] = []

/** Build a valid neutral 320 by 240 PNG header accepted by the probe decoder. */
function probePng(): Buffer {
  const png = Buffer.alloc(57)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(320, 16)
  png.writeUInt32BE(240, 20)
  png[24] = 8
  png[25] = 2
  png.writeUInt32BE(0, 33)
  png.write('IDAT', 37, 'ascii')
  png.writeUInt32BE(0, 45)
  png.write('IEND', 49, 'ascii')
  return png
}

/** Public Playwright-shaped fake; setup discovery and acquisition remain real. */
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

/** One small project context with an explicit finite browser policy. */
function context(root: string, source: 'headless-shell' | 'executable', executablePath?: string): Context {
  return {
    root,
    mode: 'dev',
    config: { browser: source === 'executable' ? { source, executablePath } : { source } },
    storyFiles: [],
  } as unknown as Context
}

/** Register the real setup handler against an inspectable socket and execution lane. */
function fixture(ctx: Context, isActive: () => boolean = () => true) {
  const value = uiChannelFixture()
  const execution = createExecutionService()
  registerScreenshotSetupChannel(ctx, value.channel, execution, isActive)
  return { ...value, execution }
}

/** Set external driver identity without permitting real package or browser work. */
function installDriverMock() {
  setupMocks.driverIdentity.mockResolvedValue({
    status: 'available',
    identity: { packageName: 'playwright', resolvedPath: '/external/playwright/index.mjs', version: '1.50.0', resolvedFrom: 'project' },
  })
  setupMocks.driver.mockResolvedValue(availableDriver())
}

afterEach(async () => {
  vi.restoreAllMocks()
  setupMocks.launch.mockReset()
  setupMocks.driverIdentity.mockReset()
  setupMocks.driver.mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('screenshot setup UI channel', () => {
  it('reads metadata without launching a browser', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-read-'))
    roots.push(root)
    const executablePath = join(root, 'browser')
    await writeFile(executablePath, '')
    installDriverMock()
    const ctx = context(root, 'executable', executablePath)
    const value = fixture(ctx)
    try {
      await value.request('histoire:ui:screenshot-setup', { requestId: 'read-1', action: 'read' })

      expect(setupMocks.launch).not.toHaveBeenCalled()
      expect(value.client.send).toHaveBeenCalledOnce()
      const [event, result] = value.client.send.mock.calls[0]
      expect(event).toBe('histoire:ui:screenshot-setup-result')
      expect(result).toMatchObject({ requestId: 'read-1', setup: { state: 'unverified' } })
      expect(JSON.stringify(result)).not.toContain(root)
    }
    finally {
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('keeps one check on the execution lane and ignores another client cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-owner-'))
    roots.push(root)
    const executablePath = join(root, 'browser')
    await writeFile(executablePath, '')
    installDriverMock()
    const started = deferred<void>()
    const releaseProbe = deferred<void>()
    const png = probePng()
    const page = { goto: vi.fn(async () => {}), screenshot: vi.fn(async () => png) }
    const browserContext = {
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => {}),
    }
    const browser = {
      isConnected: () => true,
      on: vi.fn(),
      off: vi.fn(),
      newContext: vi.fn(async () => {
        started.resolve()
        await releaseProbe.promise
        return browserContext
      }),
      close: vi.fn(async () => {}),
    }
    setupMocks.launch.mockResolvedValue(browser)
    const ctx = context(root, 'executable', executablePath)
    const value = fixture(ctx)
    const enqueue = vi.spyOn(value.execution, 'enqueue')
    const receive = value.handlers.get('histoire:ui:screenshot-setup')!
    const cancel = value.handlers.get('histoire:ui:screenshot-setup-cancel')!
    const otherClient = { send: vi.fn() }

    try {
      const checking = receive({ requestId: 'check-1', action: 'check' }, value.client)
      await started.promise
      await receive({ requestId: 'check-1', action: 'check' }, value.client)
      await cancel({ requestId: 'check-1' }, otherClient)
      expect(enqueue).toHaveBeenCalledOnce()
      expect(otherClient.send).not.toHaveBeenCalled()

      releaseProbe.resolve()
      await checking

      expect(value.client.send).toHaveBeenCalledTimes(2)
      const duplicate = value.client.send.mock.calls[0][1]
      const completed = value.client.send.mock.calls[1][1]
      expect(duplicate).toMatchObject({ requestId: 'check-1', error: { code: 'invalid' } })
      expect(completed).toMatchObject({ requestId: 'check-1', setup: { state: 'ready', source: 'executable' } })
      expect(browserContext.close).toHaveBeenCalledOnce()
      expect(setupMocks.launch).toHaveBeenCalledOnce()
    }
    finally {
      releaseProbe.resolve()
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('cancels only the exact check owned by the requesting client', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-cancel-'))
    roots.push(root)
    const driverStarted = deferred<void>()
    const driverResult = deferred<ReturnType<typeof availableDriver>>()
    setupMocks.driver.mockImplementation(() => {
      driverStarted.resolve()
      return driverResult.promise
    })
    const ctx = context(root, 'headless-shell')
    const value = fixture(ctx)
    const receive = value.handlers.get('histoire:ui:screenshot-setup')!
    const cancel = value.handlers.get('histoire:ui:screenshot-setup-cancel')!

    try {
      const checking = receive({ requestId: 'cancel-1', action: 'check' }, value.client)
      await driverStarted.promise
      await cancel({ requestId: 'cancel-1' }, value.client)
      driverResult.resolve(availableDriver())
      await checking

      expect(setupMocks.launch).not.toHaveBeenCalled()
      expect(value.client.send).not.toHaveBeenCalled()
      expect(value.execution.pendingCount).toBe(0)
    }
    finally {
      driverResult.resolve(availableDriver())
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('suppresses metadata results after their captured source generation retires', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-retire-'))
    roots.push(root)
    const driverStarted = deferred<void>()
    const driverResult = deferred<ReturnType<typeof availableDriver>>()
    let active = true
    setupMocks.driver.mockImplementation(() => {
      driverStarted.resolve()
      return driverResult.promise
    })
    const ctx = context(root, 'headless-shell')
    const value = fixture(ctx, () => active)

    try {
      const reading = value.request('histoire:ui:screenshot-setup', { requestId: 'retire-1', action: 'read' })
      await driverStarted.promise
      active = false
      driverResult.resolve(availableDriver())
      await reading

      expect(value.client.send).not.toHaveBeenCalled()
      expect(setupMocks.launch).not.toHaveBeenCalled()
    }
    finally {
      driverResult.resolve(availableDriver())
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('returns actionable shell repair after a classified explicit check failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-repair-'))
    roots.push(root)
    installDriverMock()
    setupMocks.launch.mockRejectedValue(new Error('browserType.launch: Executable doesn\'t exist at /private/browser'))
    const ctx = context(root, 'headless-shell')
    const value = fixture(ctx)
    try {
      await value.request('histoire:ui:screenshot-setup', { requestId: 'check-fail', action: 'check' })

      const result = value.client.send.mock.calls[0][1]
      expect(result).toMatchObject({
        requestId: 'check-fail',
        setup: { state: 'needs-action', reason: 'browser-missing', repairs: [{ id: 'install-shell', command: { executable: 'pnpm', args: ['exec', 'playwright', 'install', 'chromium', '--only-shell'] } }] },
      })
      expect(JSON.stringify(result)).not.toContain('/private/browser')
      expect(JSON.stringify(result)).not.toContain('vitest')
    }
    finally {
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('rejects malformed requests and bounds complete event envelopes', () => {
    expect(() => screenshotSetupRequestSchema.parse({ requestId: 'bad', action: 'check', executablePath: '/tmp/browser' })).toThrow()
    expect(isScreenshotSetupResultWithinBudget({ requestId: 'tiny', error: { code: 'failed', message: 'x'.repeat(8_400) } })).toBe(false)
    expect(isScreenshotSetupResultWithinBudget({ requestId: 'tiny', setup: { revision: 1, state: 'unverified', attempts: [], repairs: [] } })).toBe(true)
  })

  it('accepts canonical core upgrades but rejects commands outside shared allowlist', () => {
    const snapshot = {
      revision: 1,
      state: 'needs-action',
      reason: 'driver-version',
      attempts: [],
      repairs: [{
        id: 'upgrade-playwright',
        label: 'Upgrade Playwright Core',
        command: { executable: 'pnpm', args: ['add', '-D', 'playwright-core@latest'] },
      }],
    }

    expect(screenshotSetupSnapshotSchema.parse(snapshot)).toMatchObject(snapshot)
    expect(() => screenshotSetupSnapshotSchema.parse({
      ...snapshot,
      repairs: [{ ...snapshot.repairs[0], command: { executable: 'pnpm', args: ['exec', 'node', 'arbitrary-script'] } }],
    })).toThrow()
  })

  it('rejects oversized events before setup ownership or browser work begins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-setup-size-'))
    roots.push(root)
    const ctx = context(root, 'headless-shell')
    const value = fixture(ctx)
    try {
      await value.request('histoire:ui:screenshot-setup', { requestId: 'large', action: 'check', extra: 'x'.repeat(70_000) })

      expect(value.client.send).not.toHaveBeenCalled()
      expect(setupMocks.launch).not.toHaveBeenCalled()
      expect(value.execution.pendingCount).toBe(0)
    }
    finally {
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })
})

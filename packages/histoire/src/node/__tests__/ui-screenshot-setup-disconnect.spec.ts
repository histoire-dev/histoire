import type { Context } from '../context.js'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContext } from '../context.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { registerScreenshotSetupChannel } from '../server/ui-channel/screenshot-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { uiChannelFixture } from './utils/ui-channel.js'

const setupMocks = vi.hoisted(() => ({ driverIdentity: vi.fn(), driver: vi.fn(), launch: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime/browser/setup/driver.js')>()
  return { ...actual, resolveBrowserSetupDriverIdentity: setupMocks.driverIdentity, resolveBrowserSetupDriver: setupMocks.driver }
})

const roots: string[] = []

/** Build a valid neutral 320 by 240 PNG header for setup's probe decoder. */
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

/** Build project context with finite browser setup policy. */
function context(root: string): Context {
  return { root, mode: 'dev', config: { browser: { source: 'headless-shell' } }, storyFiles: [] } as unknown as Context
}

/** Register the real setup handler and execution lane. */
function fixture(ctx: Context) {
  const value = uiChannelFixture()
  const execution = createExecutionService()
  registerScreenshotSetupChannel(ctx, value.channel, execution, () => true)
  return { ...value, execution }
}

/** External Playwright-shaped driver leaves setup discovery and execution real. */
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
  setupMocks.launch.mockReset()
  setupMocks.driverIdentity.mockReset()
  setupMocks.driver.mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('screenshot setup socket ownership', () => {
  it('cancels only disconnected explicit check while another tab completes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-setup-disconnect-'))
    roots.push(root)
    const driverStarted = deferred<void>()
    const driverResult = deferred<ReturnType<typeof availableDriver>>()
    setupMocks.driver.mockImplementation(() => {
      driverStarted.resolve()
      return driverResult.promise
    })
    const png = probePng()
    const page = { goto: vi.fn(async () => {}), screenshot: vi.fn(async () => png) }
    const browserContext = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) }
    const browser = {
      isConnected: () => true,
      on: vi.fn(),
      off: vi.fn(),
      newContext: vi.fn(async () => browserContext),
      close: vi.fn(async () => {}),
    }
    setupMocks.launch.mockResolvedValue(browser)
    const ctx = context(root)
    const value = fixture(ctx)
    const otherClient = value.newClient()
    const receive = value.handlers.get('histoire:ui:screenshot-setup')!

    try {
      const disconnectedCheck = receive({ requestId: 'closed-tab', action: 'check' }, value.client)
      await driverStarted.promise
      const otherCheck = receive({ requestId: 'other-tab', action: 'check' }, otherClient)
      expect(value.client.socket.listenerCount('close')).toBe(1)
      expect(otherClient.socket.listenerCount('close')).toBe(1)

      value.client.disconnect()
      driverResult.resolve(availableDriver())
      await Promise.all([disconnectedCheck, otherCheck])

      expect(value.client.send).not.toHaveBeenCalled()
      expect(otherClient.send).toHaveBeenCalledWith('histoire:ui:screenshot-setup-result', expect.objectContaining({ requestId: 'other-tab', setup: expect.objectContaining({ state: 'ready', source: 'headless-shell' }) }))
      expect(setupMocks.launch).toHaveBeenCalledOnce()
      expect(value.client.socket.listenerCount('close')).toBe(0)
      expect(otherClient.socket.listenerCount('close')).toBe(0)
    }
    finally {
      driverResult.resolve(availableDriver())
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('does not enqueue a check for a socket already closing at admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-setup-closing-'))
    roots.push(root)
    const ctx = context(root)
    const value = fixture(ctx)
    const enqueue = vi.spyOn(value.execution, 'enqueue')
    value.client.socket.readyState = 2

    try {
      await value.request('histoire:ui:screenshot-setup', { requestId: 'closing-tab', action: 'check' })

      expect(enqueue).not.toHaveBeenCalled()
      expect(value.client.send).not.toHaveBeenCalled()
      expect(value.client.socket.listenerCount('close')).toBe(0)
    }
    finally {
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })

  it('detaches socket observer when channel cleanup cancels setup work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-setup-cleanup-'))
    roots.push(root)
    const driverStarted = deferred<void>()
    const driverResult = deferred<ReturnType<typeof availableDriver>>()
    setupMocks.driver.mockImplementation(() => {
      driverStarted.resolve()
      return driverResult.promise
    })
    const ctx = context(root)
    const value = fixture(ctx)
    const checking = value.request('histoire:ui:screenshot-setup', { requestId: 'cleanup-check', action: 'check' })

    try {
      await driverStarted.promise
      expect(value.client.socket.listenerCount('close')).toBe(1)
      const closing = value.channel.close()
      driverResult.resolve(availableDriver())
      await Promise.all([closing, checking])

      expect(value.client.socket.listenerCount('close')).toBe(0)
      expect(value.client.send).not.toHaveBeenCalled()
    }
    finally {
      driverResult.resolve(availableDriver())
      await value.channel.close()
      await value.execution.close()
      await closeContext(ctx)
    }
  })
})

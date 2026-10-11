import type { Browser, LaunchOptions } from 'playwright'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnoseBrowserSetupFailure } from '../runtime/browser/setup/diagnostics.js'
import { asPlaywrightBrowser, createBrowserSetupCandidate as candidate, createBrowserSetupOwnerFixture } from './utils/browser-setup.js'
import { createNeutralBrowserFixture } from './utils/mcp/preview-browser.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

/** Installs test-only boundaries while keeping owner and acquisition behavior real. */
function createOwner(launch: (options: LaunchOptions) => Promise<Browser>, candidates: ReturnType<typeof candidate>[]) {
  const fixture = createBrowserSetupOwnerFixture({ launch })
  mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: fixture.driver })
  mocked.discoverCandidates.mockResolvedValue(candidates)
  return fixture.owner
}

beforeEach(() => vi.clearAllMocks())

describe('safe setup attempt diagnostics', () => {
  it('recognizes an audited executable-format spawn failure without its path', () => {
    const error = Object.assign(new Error('browserType.launch: Failed to launch: Error: spawn /private/project/browser with space ENOEXEC'), { code: 'ENOEXEC' })

    expect(diagnoseBrowserSetupFailure(error, 'launch')).toEqual({
      reason: 'unsupported-platform',
      diagnostic: { code: 'executable-format' },
      continueCandidates: true,
    })
    expect(JSON.stringify(diagnoseBrowserSetupFailure(error, 'launch'))).not.toContain('/private/project')
  })

  it('recognizes only the known Chromium sandbox denial and sanitizes unknown signals', () => {
    const sandbox = new Error('browserType.launch: Failed to launch the browser process.\nBrowser logs:\n[pid=91][err] [ERROR:zygote_host_impl_linux.cc(128)] No usable sandbox!')
    expect(diagnoseBrowserSetupFailure(sandbox, 'launch')).toMatchObject({
      reason: 'permission',
      diagnostic: { code: 'sandbox-denied' },
      continueCandidates: true,
    })

    const exited = new Error('browserType.launch: Failed to launch the browser process.\nBrowser logs:\n[pid=91] <process did exit: exitCode=2, signal=SIGPRIVATE>')
    expect(diagnoseBrowserSetupFailure(exited, 'launch').diagnostic).toEqual({ code: 'process-exited', exitCode: 2 })
  })

  it('recognizes the SDK target-closed launch frame and dimmed call-log exit row', () => {
    const error = new Error([
      'browserType.launch: Target page, context or browser has been closed',
      'Browser logs:',
      '',
      '\u001B[2m  - [pid=3143986] <process did exit: exitCode=0, signal=null>\u001B[22m',
    ].join('\n'))

    expect(diagnoseBrowserSetupFailure(error, 'launch')).toEqual({
      reason: 'startup-failed',
      diagnostic: { code: 'process-exited', exitCode: 0 },
      continueCandidates: false,
    })
  })

  it('records process exit details without exposing browser logs or retrying', async () => {
    const privateLog = '/private/project/cache/browser diagnostic text'
    const launch = vi.fn(async () => {
      throw new Error(`browserType.launch: Target page, context or browser has been closed\nBrowser logs:\n\n\u001B[2m  - [pid=823] <process did exit: exitCode=17, signal=SIGSEGV>\u001B[22m\n[pid=823][err] ${privateLog}`)
    })
    const owner = createOwner(launch, [
      candidate('headless-shell'),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])

    const failure = await owner.acquire(new AbortController().signal, Date.now() + 2_000).catch(error => error)
    expect(failure).toMatchObject({ code: 'BROWSER_UNAVAILABLE', message: 'Browser startup failed; check screenshot setup' })
    expect(failure).toHaveProperty('message', 'Browser startup failed; check screenshot setup')

    const snapshot = owner.getSnapshot()
    expect(snapshot).toMatchObject({
      state: 'needs-action',
      reason: 'startup-failed',
      attempts: [{
        source: 'headless-shell',
        reason: 'startup-failed',
        stage: 'launch',
        driver: { packageName: 'playwright', version: '1.59.1' },
        diagnostic: { code: 'process-exited', exitCode: 17, signal: 'SIGSEGV' },
      }],
    })
    expect(JSON.stringify(snapshot)).not.toContain(privateLog)
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('reports only the missing library basename and continues to another candidate', async () => {
    const privatePath = '/private/project/cache/chromium'
    const chrome = createNeutralBrowserFixture()
    const launch = vi.fn(async (options: LaunchOptions) => {
      if (options.channel === 'chrome') return asPlaywrightBrowser(chrome.browser)
      throw new Error(`browserType.launch: Failed to launch the browser process.\nBrowser logs:\n[pid=42][err] ${privatePath}: error while loading shared libraries: libfixture.so.2: cannot open shared object file: No such file or directory\n[pid=42] <process did exit: exitCode=127, signal=null>`)
    })
    const owner = createOwner(launch, [
      candidate('headless-shell'),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])

    const lease = await owner.acquire(new AbortController().signal, Date.now() + 2_000)

    expect(lease.source).toBe('chrome')
    expect(owner.getSnapshot()).toMatchObject({
      state: 'ready',
      attempts: [{
        source: 'headless-shell',
        reason: 'system-dependencies',
        stage: 'launch',
        diagnostic: { code: 'missing-library', library: 'libfixture.so.2' },
      }],
    })
    expect(JSON.stringify(owner.getSnapshot())).not.toContain(privatePath)
    await lease.release()
    await owner.close()
  })

  it('marks unknown launch errors accurately and never returns private messages', async () => {
    const privateMessage = 'unclassified native startup failed at /private/project/browser token=secret'
    const launch = vi.fn(async () => {
      throw new Error(privateMessage)
    })
    const owner = createOwner(launch, [
      candidate('headless-shell'),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])

    const failure = await owner.acquire(new AbortController().signal, Date.now() + 2_000).catch(error => error)
    expect(failure).toMatchObject({ code: 'BROWSER_UNAVAILABLE', message: 'Browser startup failed; check screenshot setup' })
    expect(failure).toHaveProperty('message', 'Browser startup failed; check screenshot setup')

    expect(owner.getSnapshot()).toMatchObject({
      reason: 'startup-failed',
      attempts: [{
        reason: 'startup-failed',
        stage: 'launch',
        driver: { packageName: 'playwright', version: '1.59.1' },
        diagnostic: { code: 'unknown' },
      }],
    })
    expect(JSON.stringify(owner.getSnapshot())).not.toContain(privateMessage)
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('marks protocol failures at probe stage and stops before trying another renderer', async () => {
    const privateMessage = 'Protocol error (Page.navigate): private /project/channel payload'
    const first = createNeutralBrowserFixture()
    first.page.goto.mockRejectedValue(new Error(privateMessage))
    const launch = vi.fn(async () => asPlaywrightBrowser(first.browser))
    const owner = createOwner(launch, [
      candidate('headless-shell'),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])

    await expect(owner.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })

    expect(owner.getSnapshot()).toMatchObject({
      reason: 'startup-failed',
      attempts: [{ reason: 'startup-failed', stage: 'probe', diagnostic: { code: 'protocol-error' } }],
    })
    expect(JSON.stringify(owner.getSnapshot())).not.toContain(privateMessage)
    expect(first.context.close).toHaveBeenCalledOnce()
    expect(first.browser.close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('identifies invalid neutral PNG output without leaking parser errors', async () => {
    const privateMessage = '/private/project/bad-image-marker'
    const first = createNeutralBrowserFixture()
    first.page.screenshot.mockResolvedValue(Buffer.from(privateMessage))
    const launch = vi.fn()
      .mockResolvedValueOnce(asPlaywrightBrowser(first.browser))
    const owner = createOwner(launch, [
      candidate('headless-shell'),
      candidate('chrome', 'present', { headless: true, channel: 'chrome' }),
    ])

    await expect(owner.acquire(new AbortController().signal, Date.now() + 2_000)).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE' })

    expect(owner.getSnapshot()).toMatchObject({
      attempts: [{ reason: 'startup-failed', stage: 'probe', diagnostic: { code: 'invalid-probe-image' } }],
    })
    expect(JSON.stringify(owner.getSnapshot())).not.toContain(privateMessage)
    expect(first.context.close).toHaveBeenCalledOnce()
    expect(first.browser.close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })
})

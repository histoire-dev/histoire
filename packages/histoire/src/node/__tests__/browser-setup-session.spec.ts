import type { BrowserSetupDriverDiscovery } from '../runtime/browser/setup/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewHostRegistry } from '../runtime/browser/preview-host.js'
import { createPreviewSession } from '../runtime/browser/session.js'
import { createBrowserSetupCandidate, createBrowserSetupOwnerFixture } from './utils/browser-setup.js'
import { deferred } from './utils/mcp/deferred.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

beforeEach(() => vi.clearAllMocks())

/** Builds a real preview session around a deliberately held driver import. */
function createHeldSession(timeoutMs: number) {
  const heldDriver = deferred<BrowserSetupDriverDiscovery>()
  const launch = vi.fn(async () => {
    throw new Error('Stopped session must not launch a browser')
  })
  const { owner, driver } = createBrowserSetupOwnerFixture({ launch })
  mocked.resolveDriver.mockReturnValue(heldDriver.promise)
  mocked.discoverCandidates.mockResolvedValue([createBrowserSetupCandidate('headless-shell')])
  const host = createPreviewHostRegistry({ base: '/' })
  const session = createPreviewSession({
    root: '/project',
    host,
    setupOwner: owner,
    timeoutMs,
    target: {
      origin: 'http://histoire.test',
      storyId: 'story',
      variantId: 'variant',
      epoch: 'epoch',
      width: 320,
      height: 240,
      backgroundColor: 'transparent',
      textDirection: 'ltr',
      isActive: () => true,
    },
  })
  return { heldDriver, driver, host, launch, owner, session }
}

/** Resolves whether session authority stopped before its pending dependency. */
async function settlesWithin(promise: Promise<unknown>, timeoutMs = 300): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

describe('preview session browser setup acquisition', () => {
  it('returns cancellation while driver discovery remains pending', async () => {
    const setup = createHeldSession(5_000)
    const controller = new AbortController()
    const opening = setup.session.open(controller.signal)
    const outcome = opening.then(
      () => ({ state: 'resolved' as const }),
      error => ({ state: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(mocked.resolveDriver).toHaveBeenCalledOnce())

    controller.abort()
    try {
      expect(await settlesWithin(outcome)).toBe(true)
      await expect(outcome).resolves.toMatchObject({ state: 'rejected', error: { code: 'CANCELLED' } })
      expect(setup.owner.getSnapshot().state).toBe('unverified')
      setup.heldDriver.resolve({ status: 'available', driver: setup.driver })
      await setup.owner.discover()
      expect(setup.launch).not.toHaveBeenCalled()
    }
    finally {
      setup.heldDriver.resolve({ status: 'available', driver: setup.driver })
      await setup.session.close()
      await setup.owner.close()
      setup.host.close()
    }
  })

  it('returns timeout while driver discovery remains pending', async () => {
    const setup = createHeldSession(60)
    const opening = setup.session.open(new AbortController().signal)
    const outcome = opening.then(
      () => ({ state: 'resolved' as const }),
      error => ({ state: 'rejected' as const, error }),
    )
    await vi.waitFor(() => expect(mocked.resolveDriver).toHaveBeenCalledOnce())

    try {
      expect(await settlesWithin(outcome)).toBe(true)
      await expect(outcome).resolves.toMatchObject({ state: 'rejected', error: { code: 'TIMEOUT' } })
      expect(setup.owner.getSnapshot().state).toBe('unverified')
      setup.heldDriver.resolve({ status: 'available', driver: setup.driver })
      await setup.owner.discover()
      expect(setup.launch).not.toHaveBeenCalled()
    }
    finally {
      setup.heldDriver.resolve({ status: 'available', driver: setup.driver })
      await setup.session.close()
      await setup.owner.close()
      setup.host.close()
    }
  })
})

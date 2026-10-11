import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asPlaywrightBrowser, createBrowserSetupCandidate as candidate, createBrowserSetupOwnerFixture } from './utils/browser-setup.js'
import { deferred } from './utils/mcp/deferred.js'
import { createNeutralBrowserFixture } from './utils/mcp/preview-browser.js'

const mocked = vi.hoisted(() => ({ resolveDriver: vi.fn(), discoverCandidates: vi.fn() }))

vi.mock('../runtime/browser/setup/driver.js', () => ({ resolveBrowserSetupDriver: mocked.resolveDriver }))
vi.mock('../runtime/browser/setup/candidates.js', async importOriginal => ({ ...(await importOriginal() as object), discoverBrowserCandidates: mocked.discoverCandidates }))

beforeEach(() => vi.clearAllMocks())

describe('bounded neutral browser probe', () => {
  it('closes a context returned after cancellation while newContext is held', async () => {
    const fixture = createNeutralBrowserFixture()
    const lateContext = { close: vi.fn(async () => {}) }
    const held = deferred<any>()
    fixture.browser.newContext.mockReturnValue(held.promise)
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell'), candidate('chrome')])
    const { owner } = setup
    const controller = new AbortController()
    const acquisition = owner.acquire(controller.signal, Date.now() + 1_500)
    await vi.waitFor(() => expect(fixture.browser.newContext).toHaveBeenCalledOnce())

    controller.abort()
    await expect(acquisition).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.browser.close).toHaveBeenCalledOnce()
    held.resolve(lateContext)
    await vi.waitFor(() => expect(lateContext.close).toHaveBeenCalledOnce())
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('closes exact browser promptly when newPage never settles after cancellation', async () => {
    const fixture = createNeutralBrowserFixture()
    const held = deferred<any>()
    fixture.context.newPage.mockReturnValue(held.promise)
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell'), candidate('chrome')])
    const { owner } = setup
    const controller = new AbortController()
    const acquisition = owner.acquire(controller.signal, Date.now() + 1_500)
    await vi.waitFor(() => expect(fixture.context.newPage).toHaveBeenCalledOnce())

    controller.abort()
    await expect(acquisition).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.browser.close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('uses the candidate deadline for a held newPage and does not try another source', async () => {
    const fixture = createNeutralBrowserFixture()
    fixture.context.newPage.mockReturnValue(deferred<any>().promise)
    const launch = vi.fn(async () => asPlaywrightBrowser(fixture.browser))
    const setup = createBrowserSetupOwnerFixture({ launch })
    mocked.resolveDriver.mockResolvedValue({ status: 'available', driver: setup.driver })
    mocked.discoverCandidates.mockResolvedValue([candidate('headless-shell'), candidate('chrome')])
    const { owner } = setup
    const acquisition = owner.acquire(new AbortController().signal, Date.now() + 100)

    await expect(acquisition).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(launch).toHaveBeenCalledOnce()
    expect(fixture.browser.close).toHaveBeenCalledOnce()
    expect(owner.getSnapshot()).toMatchObject({ state: 'unverified', repairs: [] })
    await owner.close()
  })
})

import type { Browser } from 'playwright'
import type { BrowserSetupCandidate, BrowserSetupDriver, BrowserSetupPolicy } from '../../runtime/browser/setup/types.js'
import { createScreenshotSetupOwner } from '../../runtime/browser/setup/owner.js'

/** Creates one deterministic candidate with structured launch options. */
export function createBrowserSetupCandidate(
  source: BrowserSetupCandidate['source'],
  presence: BrowserSetupCandidate['presence'] = 'unknown',
  launchOptions: BrowserSetupCandidate['launchOptions'] = { headless: true },
): BrowserSetupCandidate {
  return { source, presence, launchOptions }
}

/** Creates a fake public Playwright driver around one controlled launch function. */
export function createBrowserSetupDriver(launch: BrowserSetupDriver['chromium']['launch']): BrowserSetupDriver {
  return {
    packageName: 'playwright',
    resolvedPath: '/project/node_modules/playwright/index.js',
    version: '1.59.1',
    chromium: { launch, executablePath: () => '/not-used/chromium' },
  }
}

/** Creates a trusted source policy for setup owner fixtures. */
export function createBrowserSetupPolicy(
  source: BrowserSetupPolicy['source'] = 'auto',
  executablePath?: string,
): BrowserSetupPolicy {
  return { source, ...(executablePath ? { executablePath } : {}) }
}

/** Creates an owner fixture using the same public driver and policy boundary. */
export function createBrowserSetupOwnerFixture(options: {
  /** Controlled launch function for the fake public Playwright driver. */
  launch?: BrowserSetupDriver['chromium']['launch']
  /** Trusted source policy; defaults to automatic discovery. */
  source?: BrowserSetupPolicy['source']
  /** Exact path used only for an explicit executable source. */
  executablePath?: string
  /** Captured runtime authority for generation-retirement tests. */
  isActive?: () => boolean
} = {}): { owner: ReturnType<typeof createScreenshotSetupOwner>, driver: BrowserSetupDriver } {
  const launch = options.launch ?? (async () => {
    throw new Error('Unexpected screenshot browser launch')
  })
  const driver = createBrowserSetupDriver(launch)
  const owner = createScreenshotSetupOwner({
    root: '/project',
    policy: createBrowserSetupPolicy(options.source, options.executablePath),
    isActive: options.isActive,
  })
  return { owner, driver }
}

/** Casts a neutral browser fixture through the public Playwright boundary. */
export function asPlaywrightBrowser(browser: object): Browser {
  return browser as Browser
}

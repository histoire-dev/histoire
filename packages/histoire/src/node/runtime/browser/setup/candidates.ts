import type { BrowserPresence, BrowserSetupCandidate, BrowserSetupDriver, BrowserSetupPolicy } from './types.js'
import { access } from 'node:fs/promises'
import { parseBrowserSetupVersion } from './driver.js'
import { getKnownBrowserLocations } from './locations.js'

/** Filesystem/platform boundary used for bounded candidate inventory. */
export interface BrowserCandidateDiscoveryOptions {
  /** Operating system whose finite known paths are inspected. */
  platform?: NodeJS.Platform
  /** Environment used only to expand known per-user installation roots. */
  env?: NodeJS.ProcessEnv
  /** Checks one known executable path; it must not launch the file. */
  fileStatus?: (path: string) => Promise<BrowserPresence>
}

/**
 * Enumerates finite candidates in policy order using public driver APIs and known paths.
 * It never launches a browser, scans caches, resolves PATH, or starts a process.
 */
export async function discoverBrowserCandidates(
  policy: BrowserSetupPolicy,
  driver: BrowserSetupDriver,
  options: BrowserCandidateDiscoveryOptions = {},
): Promise<BrowserSetupCandidate[]> {
  const platform = options.platform ?? process.platform
  const fileStatus = options.fileStatus ?? checkPathStatus
  const supportsSeparatedShell = supportsSeparatedHeadlessShell(driver.version)
  const requested = policy.source === 'auto'
    ? supportsSeparatedShell
      ? ['headless-shell', 'chromium', 'chrome', 'msedge'] as const
      : ['chromium', 'chrome', 'msedge'] as const
    : [policy.source] as const
  const locations = getKnownBrowserLocations(platform, options.env)
  const candidates: BrowserSetupCandidate[] = []

  for (const source of requested) {
    if (source === 'headless-shell') {
      candidates.push(supportsSeparatedShell
        ? { source, launchOptions: { headless: true }, presence: 'unknown' }
        : { source, launchOptions: { headless: true }, presence: 'absent', unavailableReason: 'driver-version' })
      continue
    }
    if (source === 'chromium') {
      if (!supportsFullChromiumChannel(driver.version)) {
        if (policy.source === 'chromium') {
          candidates.push({ source, launchOptions: { headless: true, channel: 'chromium' }, presence: 'absent', unavailableReason: 'driver-version' })
        }
        else {
          candidates.push({
            source,
            launchOptions: { headless: true },
            presence: await getDriverExecutableStatus(driver, fileStatus),
          })
        }
        continue
      }
      candidates.push({
        source,
        launchOptions: { headless: true, channel: 'chromium' },
        presence: await getDriverExecutableStatus(driver, fileStatus),
      })
      continue
    }
    if (source === 'executable') {
      const executablePath = policy.executablePath
      candidates.push({
        source,
        launchOptions: { headless: true, executablePath },
        presence: executablePath ? await fileStatus(executablePath) : 'absent',
      })
      continue
    }

    const paths = locations.filter(location => location.source === source).map(location => location.executablePath)
    const presence = paths.length ? await combinePathStatuses(paths, fileStatus) : 'absent'
    candidates.push({
      source,
      launchOptions: { headless: true, channel: source },
      presence,
      ...(!paths.length ? { unavailableReason: 'unsupported-platform' as const } : {}),
    })
  }

  return policy.source === 'auto' ? candidates.filter(candidate => candidate.presence !== 'absent') : candidates
}

/** Returns whether this driver supports Playwright's full Chromium channel. */
export function supportsFullChromiumChannel(version: string): boolean {
  const parsed = parseBrowserSetupVersion(version)
  if (!parsed) return false
  return parsed.major > 1
    || (parsed.major === 1 && parsed.minor > 49)
    || (parsed.major === 1 && parsed.minor === 49 && (parsed.patch > 0 || !parsed.prerelease))
}

/** Returns whether the driver uses a separate headless-shell binary by default. */
export function supportsSeparatedHeadlessShell(version: string): boolean {
  return supportsFullChromiumChannel(version)
}

/** Checks one executable path, treating permission and I/O uncertainty conservatively. */
async function checkPathStatus(path: string): Promise<BrowserPresence> {
  try {
    await access(path)
    return 'present'
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : 'unknown'
  }
}

/** Checks the driver's public default Chromium path; no cache directory inspection. */
async function getDriverExecutableStatus(driver: BrowserSetupDriver, fileStatus: (path: string) => Promise<BrowserPresence>): Promise<BrowserPresence> {
  try {
    const path = driver.chromium.executablePath()
    return typeof path === 'string' && path ? await fileStatus(path) : 'absent'
  }
  catch {
    return 'unknown'
  }
}

/** Uses known install paths without allowing one error to hide another location. */
async function combinePathStatuses(paths: string[], fileStatus: (path: string) => Promise<BrowserPresence>): Promise<BrowserPresence> {
  const statuses = await Promise.all(paths.map(path => fileStatus(path).catch(() => 'unknown' as const)))
  if (statuses.includes('present')) return 'present'
  if (statuses.includes('unknown')) return 'unknown'
  return 'absent'
}

import { join } from 'pathe'

/** Known stable branded browser executable location. */
export interface BrowserExecutableLocation {
  /** Playwright channel selected for this branded browser. */
  source: 'chrome' | 'msedge'
  /** Finite platform-known executable path; never discovered by filesystem scan. */
  executablePath: string
}

/**
 * Returns finite stable Chrome and Edge locations for one operating system.
 * @param platform Target Node platform; defaults to the current process.
 * @param env Environment used for supported Windows install roots.
 */
export function getKnownBrowserLocations(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): BrowserExecutableLocation[] {
  if (platform === 'win32') return getWindowsLocations(env)
  if (platform === 'darwin') return getMacLocations()
  if (platform === 'linux') return getLinuxLocations()
  return []
}

/** Returns stable Windows install paths without scanning user profiles. */
function getWindowsLocations(env: NodeJS.ProcessEnv): BrowserExecutableLocation[] {
  const locations: BrowserExecutableLocation[] = []
  const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']]
  if (env.HOMEDRIVE) roots.push(join(env.HOMEDRIVE, 'Program Files'), join(env.HOMEDRIVE, 'Program Files (x86)'))
  for (const root of unique(roots.filter((value): value is string => Boolean(value)))) {
    locations.push({ source: 'chrome', executablePath: join(root, 'Google/Chrome/Application/chrome.exe') })
    locations.push({ source: 'msedge', executablePath: join(root, 'Microsoft/Edge/Application/msedge.exe') })
  }
  return locations
}

/** Returns stable system macOS application paths. */
function getMacLocations(): BrowserExecutableLocation[] {
  return [
    { source: 'chrome', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { source: 'msedge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  ]
}

/** Returns package-manager stable Linux paths only. */
function getLinuxLocations(): BrowserExecutableLocation[] {
  return [
    { source: 'chrome', executablePath: '/opt/google/chrome/chrome' },
    { source: 'msedge', executablePath: '/opt/microsoft/msedge/msedge' },
  ]
}

/** Removes duplicate roots while retaining their declared priority. */
function unique(values: string[]): string[] {
  return [...new Set(values)]
}

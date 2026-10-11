import type { BrowserSetupDriver, BrowserSetupPolicy } from '../runtime/browser/setup/types.js'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverBrowserCandidates, supportsFullChromiumChannel } from '../runtime/browser/setup/candidates.js'
import { resolveBrowserSetupDriver, resolveBrowserSetupDriverIdentity } from '../runtime/browser/setup/driver.js'
import { getKnownBrowserLocations } from '../runtime/browser/setup/locations.js'
import * as packages from '../util/resolve-package.js'

const temporaryRoots: string[] = []
const testGlobals = globalThis as any

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  delete testGlobals.__histoireSetupDriverEvaluations
  delete testGlobals.__histoireSetupLaunches
})

describe('browser setup discovery', () => {
  it('prefers project playwright and imports its public API without launching', async () => {
    const root = await createProject()
    await createDriverPackage(root, 'playwright', '1.59.1')
    await createDriverPackage(root, 'playwright-core', '1.59.1')
    testGlobals.__histoireSetupDriverEvaluations = 0
    testGlobals.__histoireSetupLaunches = 0

    const result = await resolveBrowserSetupDriver(root)

    expect(result).toMatchObject({ status: 'available', driver: { packageName: 'playwright', version: '1.59.1', resolvedFrom: 'project' } })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(1)
    expect(testGlobals.__histoireSetupLaunches).toBe(0)
  })

  it('prefers project core over Histoire fallback playwright', async () => {
    const root = await createProject()
    const core = await createDriverPackage(root, 'playwright-core', '1.58.0')
    const fallbackRoot = await createProject()
    const fallback = await createDriverPackage(fallbackRoot, 'playwright', '1.59.1')
    const originalResolve = packages.tryResolveDependency
    vi.spyOn(packages, 'tryResolveDependency').mockImplementation((searchRoot, id, options) => {
      if (searchRoot === root && options?.fallback !== false && id === 'playwright') return fallback.entry
      if (searchRoot === root && options?.fallback !== false && id === 'playwright/package.json') return fallback.manifest
      return originalResolve(searchRoot, id, options)
    })

    const result = await resolveBrowserSetupDriver(root)

    expect(result).toMatchObject({ status: 'available', driver: { packageName: 'playwright-core', resolvedPath: await realpath(core.entry), version: '1.58.0', resolvedFrom: 'project' } })
    expect(fallback.entry).not.toBe(core.entry)
  })

  it('reads fallback version from selected entry when a project manifest is independently resolvable', async () => {
    const root = await createProject()
    await createBrokenDriverManifest(root, 'playwright', '2.0.0')
    const fallbackRoot = await createProject()
    const fallback = await createDriverPackage(fallbackRoot, 'playwright', '1.59.1')
    const originalResolve = packages.tryResolveDependency
    const resolver = vi.spyOn(packages, 'tryResolveDependency').mockImplementation((searchRoot, id, options) => {
      if (searchRoot === root && id === 'playwright' && options?.fallback !== false) return fallback.entry
      return originalResolve(searchRoot, id, options)
    })

    const result = await resolveBrowserSetupDriverIdentity(root)

    expect(result).toMatchObject({ status: 'available', identity: { version: '1.59.1', resolvedFrom: 'histoire' } })
    expect(resolver).not.toHaveBeenCalledWith(root, 'playwright/package.json', expect.anything())
  })

  it('reports a broken preferred driver without importing fallback packages', async () => {
    const root = await createProject()
    const broken = await createDriverPackage(root, 'playwright', '1.40.0', false)
    await createDriverPackage(root, 'playwright-core', '1.59.1')
    const fallbackRoot = await createProject()
    const fallback = await createDriverPackage(fallbackRoot, 'playwright', '1.59.1')
    const originalResolve = packages.tryResolveDependency
    const resolver = vi.spyOn(packages, 'tryResolveDependency').mockImplementation((searchRoot, id, options) => {
      if (searchRoot === root && options?.fallback !== false && id === 'playwright') return fallback.entry
      if (searchRoot === root && options?.fallback !== false && id === 'playwright/package.json') return fallback.manifest
      return originalResolve(searchRoot, id, options)
    })

    const result = await resolveBrowserSetupDriver(root)

    expect(result).toEqual({ status: 'invalid', reason: 'driver-invalid', packageName: 'playwright' })
    expect(resolver).not.toHaveBeenCalledWith(root, 'playwright-core', expect.anything())
    expect(broken.entry).not.toBe(fallback.entry)
  })

  it('reports import failure for the preferred driver instead of selecting project core', async () => {
    const root = await createProject()
    const broken = await createDriverPackage(root, 'playwright', '1.59.1')
    await createDriverPackage(root, 'playwright-core', '1.59.1')
    await writeFile(broken.entry, 'export const =')

    const result = await resolveBrowserSetupDriver(root)

    expect(result).toEqual({ status: 'invalid', reason: 'driver-invalid', packageName: 'playwright' })
  })

  it('requires restart after a selected entry version changes and permits a new real path', async () => {
    const root = await createProject()
    const selected = await createDriverPackage(root, 'playwright', '1.59.1')
    const newRoot = await createProject()
    await createDriverPackage(newRoot, 'playwright', '1.59.2')
    testGlobals.__histoireSetupDriverEvaluations = 0

    const initial = await Promise.all(Array.from({ length: 3 }, () => resolveBrowserSetupDriver(root)))
    expect(initial.every(result => result.status === 'available')).toBe(true)
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(1)

    await writeFile(selected.manifest, JSON.stringify({ name: 'playwright', version: '1.59.2', type: 'module', main: 'index.js' }))
    await writeFile(selected.entry, 'globalThis.__histoireSetupDriverEvaluations += 1; export const chromium = { launch() {}, executablePath() { return "/changed" } }')

    const metadata = await resolveBrowserSetupDriverIdentity(root)
    expect(metadata).toMatchObject({ status: 'available', identity: { version: '1.59.2' } })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(1)
    const changed = await resolveBrowserSetupDriver(root)
    expect(changed).toEqual({ status: 'invalid', reason: 'driver-version', packageName: 'playwright' })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(1)

    const newPath = await resolveBrowserSetupDriver(newRoot)
    expect(newPath).toMatchObject({ status: 'available', driver: { version: '1.59.2', resolvedFrom: 'project' } })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(2)
  })

  it('does not retry a failed import at the same real path after source repair', async () => {
    const root = await createProject()
    const selected = await createDriverPackage(root, 'playwright', '1.59.1')
    await writeFile(selected.entry, 'export const =')

    const failed = await resolveBrowserSetupDriver(root)
    expect(failed).toEqual({ status: 'invalid', reason: 'driver-invalid', packageName: 'playwright' })

    testGlobals.__histoireSetupDriverEvaluations = 0
    await writeFile(selected.entry, 'globalThis.__histoireSetupDriverEvaluations += 1; export const chromium = { launch() {}, executablePath() { return "/repaired" } }')
    const retry = await resolveBrowserSetupDriver(root)

    expect(retry).toEqual({ status: 'invalid', reason: 'driver-invalid', packageName: 'playwright' })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(0)
  })

  it('resolves driver identity without importing package code', async () => {
    const root = await createProject()
    await createDriverPackage(root, 'playwright-core', '1.57.0')
    testGlobals.__histoireSetupDriverEvaluations = 0

    const result = await resolveBrowserSetupDriverIdentity(root)

    expect(result).toMatchObject({ status: 'available', identity: { packageName: 'playwright-core', version: '1.57.0', resolvedFrom: 'project' } })
    expect(testGlobals.__histoireSetupDriverEvaluations).toBe(0)
  })

  it('rejects malformed driver versions before deployment code can pin them', async () => {
    const root = await createProject()
    await createDriverPackage(root, 'playwright-core', 'not-semver')

    const result = await resolveBrowserSetupDriverIdentity(root)

    expect(result).toEqual({ status: 'invalid', reason: 'driver-invalid', packageName: 'playwright-core' })
  })

  it('keeps shell presence unknown and skips proven absent automatic candidates', async () => {
    const policy: BrowserSetupPolicy = Object.freeze({ source: 'auto' })
    const driver = fakeDriver('1.59.1')
    const candidates = await discoverBrowserCandidates(policy, driver, {
      platform: 'linux',
      fileStatus: async path => path === '/opt/google/chrome/chrome' ? 'present' : 'absent',
    })

    expect(candidates.map(candidate => [candidate.source, candidate.presence])).toEqual([
      ['headless-shell', 'unknown'],
      ['chrome', 'present'],
    ])
    expect(candidates[0].launchOptions).toEqual({ headless: true })
    expect(candidates[1].launchOptions).toEqual({ headless: true, channel: 'chrome' })
  })

  it('preserves explicit executable paths with spaces and rejects full Chromium on old drivers', async () => {
    const policy: BrowserSetupPolicy = Object.freeze({ source: 'executable', executablePath: '/private/Google Chrome' })
    const candidate = await discoverBrowserCandidates(policy, fakeDriver('1.48.2'), {
      fileStatus: async path => path === '/private/Google Chrome' ? 'present' : 'absent',
    })
    const explicitChromium = await discoverBrowserCandidates(
      Object.freeze({ source: 'chromium' }),
      fakeDriver('1.48.2'),
    )

    expect(candidate).toEqual([{ source: 'executable', launchOptions: { headless: true, executablePath: '/private/Google Chrome' }, presence: 'present' }])
    expect(explicitChromium).toMatchObject([{ source: 'chromium', presence: 'absent', unavailableReason: 'driver-version' }])
    expect(supportsFullChromiumChannel('1.49.0')).toBe(true)
    expect(supportsFullChromiumChannel('1.49.0-beta.1')).toBe(false)
  })

  it('uses the old driver default Chromium as the first automatic candidate', async () => {
    const candidates = await discoverBrowserCandidates(Object.freeze({ source: 'auto' }), fakeDriver('1.48.2'), {
      platform: 'linux',
      fileStatus: async path => path === '/expected/chromium' ? 'present' : 'absent',
    })

    expect(candidates).toEqual([{
      source: 'chromium',
      launchOptions: { headless: true },
      presence: 'present',
    }])
  })

  it('continues from absent old default Chromium to an installed branded channel', async () => {
    const candidates = await discoverBrowserCandidates(Object.freeze({ source: 'auto' }), fakeDriver('1.48.2'), {
      platform: 'linux',
      fileStatus: async path => path === '/opt/google/chrome/chrome' ? 'present' : 'absent',
    })

    expect(candidates).toEqual([{
      source: 'chrome',
      launchOptions: { headless: true, channel: 'chrome' },
      presence: 'present',
    }])
  })

  it('reports explicit shell as unsupported by pre-1.49 drivers', async () => {
    const candidates = await discoverBrowserCandidates(Object.freeze({ source: 'headless-shell' }), fakeDriver('1.48.2'))

    expect(candidates).toEqual([{
      source: 'headless-shell',
      launchOptions: { headless: true },
      presence: 'absent',
      unavailableReason: 'driver-version',
    }])
  })

  it('returns finite stable branded locations for Linux, macOS, and Windows', () => {
    expect(getKnownBrowserLocations('linux', {})).toContainEqual({ source: 'chrome', executablePath: '/opt/google/chrome/chrome' })
    expect(getKnownBrowserLocations('linux', {})).not.toContainEqual(expect.objectContaining({ executablePath: '/usr/bin/google-chrome' }))
    expect(getKnownBrowserLocations('darwin', {})).toContainEqual({ source: 'msedge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' })
    expect(getKnownBrowserLocations('win32', { PROGRAMFILES: 'D:/Apps' })).toContainEqual({ source: 'chrome', executablePath: 'D:/Apps/Google/Chrome/Application/chrome.exe' })
    expect(getKnownBrowserLocations('freebsd', {})).toEqual([])
  })
})

/** Creates isolated temporary project root. */
async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'histoire-browser-setup-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'node_modules'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'browser-setup-fixture', type: 'module' }))
  return root
}

/** Installs a controlled external driver double into one temporary project. */
async function createDriverPackage(root: string, name: 'playwright' | 'playwright-core', version: string, valid = true) {
  const packageDir = join(root, 'node_modules', name)
  const entry = join(packageDir, 'index.js')
  const manifest = join(packageDir, 'package.json')
  await mkdir(packageDir, { recursive: true })
  await writeFile(manifest, JSON.stringify({ name, version, type: 'module', main: 'index.js' }))
  await writeFile(entry, `
    globalThis.__histoireSetupDriverEvaluations = (globalThis.__histoireSetupDriverEvaluations || 0) + 1
    export const chromium = {
      ${valid ? 'launch() { globalThis.__histoireSetupLaunches = (globalThis.__histoireSetupLaunches || 0) + 1; throw new Error("unexpected launch") },' : ''}
      executablePath() { return "/expected/chromium" },
    }
  `)
  return { entry, manifest }
}

/** Creates a project manifest whose advertised entry cannot be resolved. */
async function createBrokenDriverManifest(root: string, name: 'playwright' | 'playwright-core', version: string): Promise<void> {
  const packageDir = join(root, 'node_modules', name)
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version, main: 'missing.js' }))
}

/** Returns one browser driver double for candidate inventory tests. */
function fakeDriver(version: string): BrowserSetupDriver {
  return {
    packageName: 'playwright',
    resolvedPath: '/private/driver/index.js',
    version,
    chromium: {
      launch: async () => { throw new Error('candidate discovery must not launch') },
      executablePath: () => '/expected/chromium',
    },
  }
}

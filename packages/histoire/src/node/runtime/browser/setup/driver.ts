import type {
  BrowserSetupDriver,
  BrowserSetupDriverDiscovery,
  BrowserSetupDriverIdentity,
  BrowserSetupDriverIdentityDiscovery,
  BrowserSetupPackage,
} from './types.js'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { importResolvedModule } from '../../../util/import-resolved.js'
import { tryResolveDependency } from '../../../util/resolve-package.js'

/** Parsed SemVer fields needed to validate and gate driver capabilities. */
export interface BrowserSetupVersion {
  /** Semantic major component. */
  major: number
  /** Semantic minor component. */
  minor: number
  /** Semantic patch component. */
  patch: number
  /** Whether this is a prerelease rather than the matching stable version. */
  prerelease: boolean
}

type ImportedDriverRecord =
  | { readonly version: string, readonly status: 'loading', promise: Promise<BrowserSetupDriverDiscovery> }
  | { readonly version: string, readonly status: 'available', driver: BrowserSetupDriver }
  | { readonly version: string, readonly status: 'invalid' }

/** Tracks module-cache identity by real path; failed imports remain non-retryable. */
const importedDrivers = new Map<string, ImportedDriverRecord>()

/**
 * Resolves driver package identity without evaluating its code.
 * Project Playwright and core are considered before either Histoire fallback.
 * @param projectRoot Histoire project root used for package resolution.
 */
export async function resolveBrowserSetupDriverIdentity(projectRoot: string): Promise<BrowserSetupDriverIdentityDiscovery> {
  const selected = resolveDriverEntry(projectRoot)
  if (!selected) return { status: 'missing', reason: 'driver-missing' }

  try {
    const resolvedPath = await realpath(selected.entry)
    const version = await readDriverVersion(resolvedPath, selected.packageName)

    const identity: BrowserSetupDriverIdentity = Object.freeze({
      packageName: selected.packageName,
      resolvedPath,
      version,
      resolvedFrom: selected.resolvedFrom,
    })
    return { status: 'available', identity }
  }
  catch {
    return { status: 'invalid', reason: 'driver-invalid', packageName: selected.packageName }
  }
}

/**
 * Resolves and validates the optional Playwright browser API without launching it.
 * Imported module versions are pinned to their real path for this process; changed versions need restart.
 * A resolved but broken preferred package is reported instead of silently replaced.
 * @param projectRoot Histoire project root used for package resolution.
 */
export async function resolveBrowserSetupDriver(projectRoot: string): Promise<BrowserSetupDriverDiscovery> {
  const resolution = await resolveBrowserSetupDriverIdentity(projectRoot)
  if (resolution.status !== 'available') return resolution

  const { identity } = resolution
  const prior = importedDrivers.get(identity.resolvedPath)
  if (prior) {
    if (prior.version !== identity.version) {
      return { status: 'invalid', reason: 'driver-version', packageName: identity.packageName }
    }
    if (prior.status === 'loading') return prior.promise
    if (prior.status === 'available') return { status: 'available', driver: prior.driver }
    return { status: 'invalid', reason: 'driver-invalid', packageName: identity.packageName }
  }

  let completeImport!: (result: BrowserSetupDriverDiscovery) => void
  const pending: Extract<ImportedDriverRecord, { status: 'loading' }> = {
    version: identity.version,
    status: 'loading',
    promise: new Promise((resolve) => { completeImport = resolve }),
  }
  importedDrivers.set(identity.resolvedPath, pending)
  void importAndValidateDriver(identity).then(
    completeImport,
    () => completeImport({ status: 'invalid', reason: 'driver-invalid', packageName: identity.packageName }),
  )
  const result = await pending.promise
  if (importedDrivers.get(identity.resolvedPath) === pending) {
    importedDrivers.set(identity.resolvedPath, result.status === 'available'
      ? { version: identity.version, status: 'available', driver: result.driver }
      : { version: identity.version, status: 'invalid' })
  }
  return result
}

/** Imports one selected real path once and validates its public launch surface. */
async function importAndValidateDriver(identity: BrowserSetupDriverIdentity): Promise<BrowserSetupDriverDiscovery> {
  try {
    const module = await importResolvedModule<Record<string, unknown> & { default?: Record<string, unknown> }>(identity.resolvedPath)
    const namespace = module.chromium ? module : module.default
    const chromium = namespace?.chromium as BrowserSetupDriver['chromium'] | undefined
    if (typeof chromium?.launch !== 'function' || typeof chromium.executablePath !== 'function') {
      return { status: 'invalid', reason: 'driver-invalid', packageName: identity.packageName }
    }

    const currentVersion = await readDriverVersion(identity.resolvedPath, identity.packageName)
    if (currentVersion !== identity.version) {
      return { status: 'invalid', reason: 'driver-version', packageName: identity.packageName }
    }

    const driver: BrowserSetupDriver = Object.freeze({
      ...identity,
      chromium,
    })
    return { status: 'available', driver }
  }
  catch {
    return { status: 'invalid', reason: 'driver-invalid', packageName: identity.packageName }
  }
}

/** Selects project playwright, project core, then Histoire's same fallback order. */
function resolveDriverEntry(projectRoot: string): { packageName: BrowserSetupPackage, entry: string, resolvedFrom: 'project' | 'histoire' } | null {
  const projectPlaywright = tryResolveDependency(projectRoot, 'playwright', { fallback: false })
  if (projectPlaywright) return { packageName: 'playwright', entry: projectPlaywright, resolvedFrom: 'project' }

  const projectCore = tryResolveDependency(projectRoot, 'playwright-core', { fallback: false })
  if (projectCore) return { packageName: 'playwright-core', entry: projectCore, resolvedFrom: 'project' }

  const histoirePlaywright = tryResolveDependency(projectRoot, 'playwright')
  if (histoirePlaywright) return { packageName: 'playwright', entry: histoirePlaywright, resolvedFrom: 'histoire' }

  const histoireCore = tryResolveDependency(projectRoot, 'playwright-core')
  if (histoireCore) return { packageName: 'playwright-core', entry: histoireCore, resolvedFrom: 'histoire' }
  return null
}

/** Reads only ancestor manifests of the captured entry until its package name matches. */
async function readDriverVersion(resolvedPath: string, packageName: BrowserSetupPackage): Promise<string> {
  let directory = dirname(resolvedPath)
  while (true) {
    const manifestPath = join(directory, 'package.json')
    let source: string
    try {
      source = await readFile(manifestPath, 'utf8')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
      continue
    }

    const manifest = JSON.parse(source) as { name?: unknown, version?: unknown }
    if (manifest.name === packageName) {
      if (typeof manifest.version !== 'string' || !parseBrowserSetupVersion(manifest.version)) throw new Error('Driver version is invalid')
      return manifest.version
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('Driver package manifest did not match the resolved entry')
}

/** Parses package version metadata as SemVer, returning `null` for invalid values. */
export function parseBrowserSetupVersion(version: string): BrowserSetupVersion | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i.exec(version)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  }
}

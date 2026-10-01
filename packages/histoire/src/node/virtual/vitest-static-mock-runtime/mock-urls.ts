import {
  getComparableBuiltModuleBase,
  getComparableModuleBase,
  getImportSpecifiers,
  isRelativeOrAbsoluteSpecifier,
  pickByParentSegments,
} from './module-ids.js'

const sourceCache = new Map<string, Promise<string>>()

/**
 * Finds the built asset URL corresponding to a mocked raw import id.
 */
export function findStaticMockImportUrl(source: string, rawId: string, importerUrl: string) {
  const rawBase = getComparableModuleBase(rawId)
  if (!rawBase) {
    return null
  }

  const candidates = new Set<string>()

  for (const specifier of getImportSpecifiers(source)) {
    if (!isRelativeOrAbsoluteSpecifier(specifier)) {
      continue
    }

    const candidateUrl = new URL(specifier, importerUrl)

    if (getComparableBuiltModuleBase(candidateUrl.pathname) === rawBase) {
      candidates.add(`${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}`)
    }
  }

  if (candidates.size <= 1) {
    return candidates.values().next().value ?? null
  }

  // Two source modules sharing a file name (`a/utils.ts` + `b/utils.ts`) emit
  // two chunks with the same comparable base. Taking the first match would bind
  // the mock to an unrelated module, so disambiguate by directory and report the
  // gap instead of guessing.
  const match = pickByParentSegments(rawId, [...candidates])
  if (match) {
    return match
  }

  console.warn(
    `[histoire] Could not tell which built module "${rawId}" refers to: `
    + `${[...candidates].join(', ')} all match its file name. The Vitest mock was not applied to any of them.`,
  )

  return null
}

/**
 * Finds the registered mock URL referenced by a Vite dynamic import loader.
 */
export function findStaticMockLoaderImportUrl(loaderSource: string, mockUrls: Iterable<string>) {
  const mockUrlsByBase = new Map<string, string[]>()

  for (const mockUrl of mockUrls) {
    const base = getComparableBuiltModuleBase(mockUrl)
    const list = mockUrlsByBase.get(base) ?? []
    list.push(mockUrl)
    mockUrlsByBase.set(base, list)
  }

  for (const specifier of getImportSpecifiers(loaderSource)) {
    const candidates = mockUrlsByBase.get(getComparableBuiltModuleBase(specifier))
    if (!candidates?.length) {
      continue
    }

    if (candidates.length === 1) {
      return candidates[0]
    }

    // Same-basename mocks from different directories (./a/config + ./b/config):
    // disambiguate by shared parent path segments, and bail out (fallback URL
    // resolution) when still ambiguous rather than redirecting the loader to
    // the wrong mock.
    const match = pickByParentSegments(specifier, candidates)
    if (match) {
      return match
    }
  }

  return null
}

/** Resolves a mocked source import to the hashed asset emitted by Vite build. */
export async function resolveStaticMockUrl(rawId: string, importer: string) {
  const importerUrl = getImporterUrl(importer)
  if (!importerUrl) {
    return null
  }

  const source = await readModuleSource(importerUrl).catch(() => null)
  return source ? findStaticMockImportUrl(source, rawId, importerUrl.href) : null
}

/** Builds a best-effort URL when the transformed source does not expose a match. */
export function resolveFallbackUrl(rawId: string, importer: string) {
  try {
    return new URL(rawId, getImporterUrl(importer) ?? window.location.href).pathname
  }
  catch {
    return rawId
  }
}

/** Adds a Vitest-style timestamp query that MSW strips when matching mocks. */
export function getTimestampedMockUrl(url: string) {
  const resolved = new URL(url, window.location.href)
  resolved.searchParams.set('t', String(Date.now()))
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

/** Converts a stack-derived importer value into a fetchable URL. */
function getImporterUrl(importer: string) {
  if (!importer) {
    return null
  }

  try {
    return new URL(importer, window.location.href)
  }
  catch {
    return null
  }
}

/** Fetches and caches one built module source file. */
function readModuleSource(url: URL) {
  const href = url.href
  const cached = sourceCache.get(href)
  if (cached) {
    return cached
  }

  const source = fetch(href).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to read built module source ${href}: ${response.status}`)
    }
    return await response.text()
  })
  sourceCache.set(href, source)
  return source
}

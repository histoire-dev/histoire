/**
 * Module-id string helpers shared by the static (build mode) mock resolution.
 *
 * In build mode there is no Vite dev server to ask, so mocked modules can only
 * be matched by comparing import specifiers found in the emitted chunks.
 */

/** Extracts static and dynamic import specifiers from Vite-built JavaScript. */
export function getImportSpecifiers(source: string) {
  const result = new Set<string>()
  const dynamicImportRE = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"']+)["']/g
  const staticFromRE = /\bfrom\s*["']([^"']+)["']/g
  const sideEffectImportRE = /\bimport\s*["']([^"']+)["']/g

  for (const regexp of [dynamicImportRE, staticFromRE, sideEffectImportRE]) {
    while (true) {
      const match = regexp.exec(source)
      if (!match) {
        break
      }
      result.add(match[1])
    }
  }

  return result
}

/** Returns true for import specifiers that can be resolved in the current build. */
export function isRelativeOrAbsoluteSpecifier(value: string) {
  return value.startsWith('.') || value.startsWith('/')
}

/** Normalizes a source import id so it can be compared to a built chunk name. */
export function getComparableModuleBase(id: string) {
  const segment = getLastPathSegment(id)
  return segment ? stripKnownExtensions(segment) : null
}

/** Normalizes a Vite build chunk file name back to its source-like base name. */
export function getComparableBuiltModuleBase(id: string) {
  const withoutExtension = stripKnownExtensions(getLastPathSegment(id))
  // Only strip suffixes that look like build hashes: Vite's base64url hashes
  // virtually always carry an uppercase letter or digit, while kebab-case
  // name segments (`-settings` in `preview-settings`) are all-lowercase and
  // must survive.
  return withoutExtension.replace(/-(?=[\w-]*[A-Z0-9])[\w-]{8,12}$/, '')
}

/**
 * Picks the candidate sharing the most trailing parent path segments with the
 * specifier. Returns null on a tie — a wrong pick would redirect a dynamic
 * import to a different module's mock.
 */
export function pickByParentSegments(specifier: string, candidates: string[]) {
  const specifierParents = getParentSegments(specifier)
  let best: string | null = null
  let bestScore = -1
  let tied = false

  for (const candidate of candidates) {
    const candidateParents = getParentSegments(candidate)
    let score = 0
    while (
      score < specifierParents.length
      && score < candidateParents.length
      && specifierParents[specifierParents.length - 1 - score] === candidateParents[candidateParents.length - 1 - score]
    ) {
      score++
    }

    if (score > bestScore) {
      best = candidate
      bestScore = score
      tied = false
    }
    else if (score === bestScore) {
      tied = true
    }
  }

  return tied ? null : best
}

/** Returns the path segments before the file name, without query or hash. */
function getParentSegments(id: string) {
  return id.split(/[?#]/)[0].split('/').filter(Boolean).slice(0, -1)
}

/** Returns the last path segment without query or hash. */
function getLastPathSegment(id: string) {
  return id.split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? ''
}

/** Removes source and build extensions that should not affect mock matching. */
function stripKnownExtensions(value: string) {
  let result = value
  while (/\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(result)) {
    result = result.replace(/\.(?:[cm]?[jt]sx?|vue|svelte)$/, '')
  }
  return result
}

import { VITEST_DYNAMIC_IMPORT_SNIPPET } from '../vitest-runner-bootstrap.js'

/**
 * Emits the story-loading layer of the preview runtime:
 * - the Vitest-aware dynamic import wrapper and the variant test session,
 * - `loadStoryFile` and its mapped preview cache,
 * - the stale-runtime one-shot reload used when the baked metadata predates the
 *   latest collection,
 * - the collected test-definition globals, cleared together with the caches
 *   when a story is invalidated by HMR.
 */
export function previewStoryLoading(mountTimeoutMs: number) {
  return `${VITEST_DYNAMIC_IMPORT_SNIPPET}

const variantTestSession = createVariantTestSession({
  files,
  mountTimeoutMs: ${mountTimeoutMs},
  moduleLoaders,
  runWithDynamicImport: runWithVitestDynamicImport,
  ensureEnvironment: ensureVitestPreviewEnvironment,
  offscreenRenderMount: true,
})

const STALE_RELOAD_GUARD_KEY = '__histoire_preview_stale_reload__'

/**
 * Reloads the iframe once per stale selection: the baked story metadata goes
 * stale when stories/variants change while this module instance is running,
 * and the dev server invalidates the module on every collection — a reload
 * picks up the fresh data. The sessionStorage guard prevents reload loops
 * when the selection is genuinely unknown (e.g. a removed story).
 */
function attemptStaleRuntimeReload(reasonKey) {
  let lastReason = null
  try {
    lastReason = window.sessionStorage.getItem(STALE_RELOAD_GUARD_KEY)
  }
  catch (e) {
    // sessionStorage can be unavailable — degrade to never reloading
    // instead of risking a reload loop we cannot track.
    return false
  }

  if (lastReason === reasonKey) {
    return false
  }

  try {
    window.sessionStorage.setItem(STALE_RELOAD_GUARD_KEY, reasonKey)
  }
  catch (e) {
    return false
  }

  window.location.reload()
  return true
}

function clearStaleRuntimeReloadGuard() {
  try {
    window.sessionStorage.removeItem(STALE_RELOAD_GUARD_KEY)
  }
  catch (e) {
    // Noop
  }
}

function clearRuntimeTestDefinitions() {
  globalThis[TEST_DEFINITIONS_KEY] = []
}

function setCollectedTestDefinitions(definitions) {
  globalThis[TEST_DEFINITIONS_KEY] = definitions
}

/**
 * Clears the preview-side caches for a story after a hot update so future test
 * collection reloads the story module instead of serving stale registrations.
 */
function invalidateStoryRuntime(storyId) {
  storyFileCache.delete(storyId)
  variantTestSession.invalidateStory(storyId)

  if (selectionState.storyId === storyId) {
    clearRuntimeTestDefinitions()
  }
}

async function loadStoryFile(storyId, { useCache = true } = {}) {
  if (useCache && storyFileCache.has(storyId)) {
    return storyFileCache.get(storyId)
  }

  // The session owns first import and captures module-scope onTest callbacks.
  // A separate native import here would consume them before its registry exists.
  const version = variantTestSession.getStoryModuleVersion(storyId)
  const mappedFile = await variantTestSession.loadStoryFile(storyId)

  if (useCache && variantTestSession.getStoryModuleVersion(storyId) === version) {
    storyFileCache.set(storyId, mappedFile)
  }

  return mappedFile
}`
}

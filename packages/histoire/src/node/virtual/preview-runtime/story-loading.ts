import { VITEST_DYNAMIC_IMPORT_SNIPPET } from '../vitest-runner-bootstrap.js'

/**
 * Emits the story-loading layer of the preview runtime:
 * - the Vitest-aware dynamic import wrapper and the variant test session,
 * - `getSerializedFile` / `loadStoryFile` with their module cache,
 * - the stale-runtime one-shot reload used when the baked metadata predates the
 *   latest collection,
 * - the collected test-definition globals, cleared together with the caches
 *   when a story is invalidated by HMR.
 */
export function previewStoryLoading() {
  return `${VITEST_DYNAMIC_IMPORT_SNIPPET}

const variantTestSession = createVariantTestSession({
  files,
  moduleLoaders,
  runWithDynamicImport: runWithVitestDynamicImport,
  ensureEnvironment: ensureVitestPreviewEnvironment,
  offscreenRenderMount: true,
})

function getSerializedFile(storyId) {
  const file = files.find(item => item.id === storyId)
  if (!file) {
    throw new Error(\`Unknown histoire story "\${storyId}"\`)
  }
  return file
}

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
  await ensureVitestPreviewEnvironment()

  if (useCache && storyFileCache.has(storyId)) {
    return storyFileCache.get(storyId)
  }

  const file = getSerializedFile(storyId)
  const loadModule = moduleLoaders[storyId]
  if (!loadModule) {
    throw new Error(\`Missing histoire story module loader for "\${storyId}"\`)
  }

  // Same version as the test session: importing the story at a different one
  // would give the preview and the session two module instances of it.
  const version = variantTestSession.getStoryModuleVersion(storyId)
  const module = await runWithVitestDynamicImport(() => loadModule(version))
  const mappedFile = mapFile({
    ...file,
    component: module.default,
    source: async () => ({ default: '' }),
  })

  if (useCache) {
    storyFileCache.set(storyId, mappedFile)
  }

  return mappedFile
}`
}

import type { HistoireTestRegistration, StoryFile } from '@histoire/shared'
import type { ImportedStoryModule, SerializedStoryFile, SessionStoryFile, VariantTestSessionOptions } from './types.js'
import { mapStoryFile } from '../map-story-file.js'
import { withRegistry } from './registry.js'

/** The subset of the session options the story module cache needs. */
type StoryModuleCacheOptions = Pick<
  VariantTestSessionOptions,
  'files' | 'moduleLoaders' | 'runWithDynamicImport' | 'ensureEnvironment'
>

/**
 * Looks up the baked metadata of a story by id.
 * @throws When the runtime was built without that story.
 */
function getSerializedFile(files: SerializedStoryFile[], storyId: string) {
  const file = files.find(item => item.id === storyId)
  if (!file) {
    throw new Error(`Unknown histoire story "${storyId}"`)
  }
  return file
}

/**
 * Creates the cache that imports story modules once and hands the session a
 * freshly mapped story file per collect/run flow.
 *
 * Importing a story executes its top-level code, which may already register
 * tests — those registrations are captured here and replayed as their own
 * group by the session.
 * @param options Story metadata, module loaders and the dynamic-import wrapper.
 */
export function createStoryModuleCache(options: StoryModuleCacheOptions) {
  const importedStoryCache = new Map<string, ImportedStoryModule>()
  const storyModuleVersions = new Map<string, number>()

  /**
   * Clears the cached imported story module for a specific story so the next
   * collection or run observes the latest HMR-updated module instance.
   */
  function invalidateStory(storyId: string) {
    importedStoryCache.delete(storyId)
    // Bumping the version busts the module URL as well: re-importing the same
    // URL is served from the browser's native module cache, so the story's
    // top-level code — where module-scope `onTest(...)` definitions live —
    // would never run again and its tests would come back empty.
    storyModuleVersions.set(storyId, (storyModuleVersions.get(storyId) ?? 0) + 1)
  }

  /**
   * Version the story module is currently imported at, `undefined` until the
   * story is invalidated for the first time.
   */
  function getStoryModuleVersion(storyId: string) {
    return storyModuleVersions.get(storyId)
  }

  /**
   * Imports a story module (or returns the cached one), capturing the test
   * registrations emitted while its top-level code runs.
   */
  async function loadImportedStory(storyId: string, { useCache = true } = {}): Promise<ImportedStoryModule> {
    await options.ensureEnvironment?.()

    if (useCache && importedStoryCache.has(storyId)) {
      return importedStoryCache.get(storyId)!
    }

    const file = getSerializedFile(options.files, storyId)
    const loadModule = options.moduleLoaders[storyId]
    if (!loadModule) {
      throw new Error(`Missing histoire story module loader for "${storyId}"`)
    }

    const definitions: HistoireTestRegistration[] = []
    let component: any

    const version = getStoryModuleVersion(storyId)
    await withRegistry(definitions, true, async () => {
      const module = await options.runWithDynamicImport(() => loadModule(version))
      component = module.default
    })

    const result: ImportedStoryModule = {
      component,
      definitions: definitions.slice(),
      file,
    }

    if (useCache) {
      importedStoryCache.set(storyId, result)
    }

    return result
  }

  /**
   * Builds the mapped story file a variant session mounts, plus a copy of the
   * import-time registrations (the session mutates neither).
   */
  async function createSessionStoryFile(storyId: string): Promise<SessionStoryFile> {
    const imported = await loadImportedStory(storyId)

    return {
      file: mapStoryFile({
        ...imported.file,
        component: imported.component,
        source: async () => ({ default: '' }),
      }) as StoryFile,
      importedDefinitions: imported.definitions.slice(),
    }
  }

  return {
    createSessionStoryFile,
    getStoryModuleVersion,
    invalidateStory,
  }
}

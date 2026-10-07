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
  /** One-time project setup imports are separate from variant state and survive story HMR. */
  const setupModuleRegistrations = new Map<string, HistoireTestRegistration[]>()

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
   * Retains test registrations emitted while lazily probing setup modules.
   * These virtual modules are native-import cached across story invalidation.
   * @param storyId Story whose collection first observed the registrations.
   * @param registrations Registrations emitted by the setup-module import.
   */
  function rememberSetupModuleRegistrations(storyId: string, registrations: HistoireTestRegistration[]) {
    const retained = setupModuleRegistrations.get(storyId) ?? []
    const additions = registrations.filter(registration => !retained.includes(registration))

    if (!additions.length) {
      return
    }

    retained.push(...additions)
    setupModuleRegistrations.set(storyId, retained)
    importedStoryCache.get(storyId)?.definitions.push(...additions)
  }

  /**
   * Imports a story module (or returns the cached one), capturing the test
   * registrations emitted while its top-level code runs.
   */
  async function loadImportedStory(storyId: string, testing: boolean): Promise<ImportedStoryModule> {
    await options.ensureEnvironment?.()

    if (importedStoryCache.has(storyId)) {
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
    await withRegistry(definitions, testing, async () => {
      const module = await options.runWithDynamicImport(() => loadModule(version))
      component = module.default
    })

    const result: ImportedStoryModule = {
      component,
      definitions: definitions.slice(),
      file,
    }

    // A hot update during the import must not repopulate the cache with its old version.
    if (getStoryModuleVersion(storyId) === version) {
      importedStoryCache.set(storyId, result)
    }

    return result
  }

  /**
   * Builds the mapped story file a variant session mounts, plus a copy of the
   * import-time registrations (the session mutates neither).
   */
  async function createSessionStoryFile(storyId: string, testing = true): Promise<SessionStoryFile> {
    const imported = await loadImportedStory(storyId, testing)
    const importedDefinitions = imported.definitions.slice()

    // Story invalidation replaces its module cache, while project setup modules
    // remain native-import cached. Reattach their captured registrations once.
    for (const registration of setupModuleRegistrations.get(storyId) ?? []) {
      if (!importedDefinitions.includes(registration)) {
        importedDefinitions.push(registration)
      }
    }

    return {
      file: mapStoryFile({
        ...imported.file,
        component: imported.component,
        source: async () => ({ default: '' }),
      }) as StoryFile,
      importedDefinitions,
    }
  }

  return {
    createSessionStoryFile,
    getStoryModuleVersion,
    invalidateStory,
    rememberSetupModuleRegistrations,
  }
}

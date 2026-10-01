import type { HistoireTestRegistration, ServerStory, StoryFile } from '@histoire/shared'

/**
 * Story metadata baked into the preview runtime / test harness at transform
 * time, one entry per collected story file. Serialized with `JSON.stringify`
 * into the emitted `files` constant, so every field must be JSON-safe.
 */
export interface SerializedStoryFile {
  /** Story file id — also the key of its module loader. */
  id: string
  /** Tree path segments used by the app story tree. */
  path?: string[]
  /** Story file path relative to the project root. */
  filePath: string
  /** Companion markdown docs file path, when the story has one. */
  docsFilePath?: string
  /** Id of the support plugin (vue3, svelte3, …) owning the file. */
  supportPluginId: string
  /** Collected story data (variants, title, …). */
  story: ServerStory
  /** Vite module id the generated loader dynamically imports. */
  moduleId: string
}

/**
 * One story module imported by the session, together with the test
 * registrations its top-level code emitted while being imported.
 */
export interface ImportedStoryModule {
  component: any
  definitions: HistoireTestRegistration[]
  file: SerializedStoryFile
}

/**
 * The mapped story file a variant session mounts, plus the registrations
 * captured at import time (they belong to no mount phase of their own).
 */
export interface SessionStoryFile {
  file: StoryFile
  importedDefinitions: HistoireTestRegistration[]
}

/** A story module imported by its generated loader. */
export interface StoryModuleExports {
  /** The story component, mounted by the session. */
  default: any
  [key: string]: any
}

export interface VariantTestSessionOptions {
  files: SerializedStoryFile[]
  /** Maximum time allowed for bootstrap and render mounting. */
  mountTimeoutMs: number
  /**
   * Generated story module loaders, keyed by story id. The optional version is
   * appended to the module URL to bust the browser's native module cache after
   * a hot update; loaders emitted for a built app ignore it.
   */
  moduleLoaders: Record<string, (version?: number) => Promise<StoryModuleExports>>
  runWithDynamicImport: (loader: () => Promise<StoryModuleExports>) => Promise<StoryModuleExports>
  ensureEnvironment?: () => Promise<void> | void
  /**
   * Positions the session's render mounts off the viewport. The preview
   * iframe enables this so collect/run never flashes a visible second copy
   * of the story over the actual preview.
   */
  offscreenRenderMount?: boolean
}

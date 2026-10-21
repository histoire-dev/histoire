import type { Context } from '../../context.js'
import type { PreviewRuntimePreambleOptions, PreviewRuntimeStoryFile } from './preamble.js'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { hasProjectVitest } from '../../util/has-vitest.js'
import { resolveHistoireAppBundledDir } from '../../util/resolve-histoire-app.js'
import { resolveHistoireSharedEntry } from '../../util/resolve-histoire-shared.js'
import { tryResolveVitestModule } from '../../util/resolve-vitest-package.js'
import { getStoryCollectTimeout } from '../../util/test-timeouts.js'
import { previewAppRoot } from './app-root.js'
import { previewApp } from './app.js'
import { previewComponents } from './components.js'
import { previewElementInspection } from './element-inspection.js'
import { previewErrorOverlay } from './error-overlay.js'
import { previewHostMessaging } from './host-messaging.js'
import { previewMount } from './mount.js'
import { previewRuntimePreamble } from './preamble.js'
import { buildStoryEntryLoaders, buildStoryEntryModule, parseStoryEntryId } from './story-entries.js'
import { previewStoryLoading } from './story-loading.js'
import { buildStoryModuleLoader } from './story-module-loader.js'
import { previewVariantBridge } from './variant-bridge.js'
import { previewVitestEnvironment } from './vitest-environment.js'

export { PREVIEW_STORY_ENTRY_ID_PREFIX, RESOLVED_PREVIEW_STORY_ENTRY_ID_PREFIX } from './story-entries.js'

const require = createRequire(import.meta.url)

/** Per-context salt of story entry versions (see `getStoryEntrySpecifier`). */
const storyEntrySalts = new WeakMap<Context, string>()

/**
 * Options of {@link buildPreviewRuntimeSource}: everything the emitted runtime
 * needs, already resolved. Kept separate from {@link previewRuntime} so the
 * source can be generated (and parsed in tests) without touching the module
 * resolver or a real {@link Context}.
 */
export interface PreviewRuntimeSourceOptions {
  /**
   * True when Vitest and its mocker packages resolve from the project root.
   * Toggles the mocker imports and the real `ensureVitestPreviewEnvironment`
   * body; without it the runtime boots without any Vitest global.
   */
  hasVitestPreview: boolean
  /** Resolved id of `@vitest/spy` (only used when `hasVitestPreview`). */
  vitestSpyId: string | null
  /** Resolved id of `@vitest/mocker/browser` (only used when `hasVitestPreview`). */
  vitestMockerBrowserId: string | null
  /** Resolved id of the `@histoire/shared` runtime entry. */
  histoireSharedId: string
  /** Resolved id of the variant test session module. */
  variantTestSessionId: string
  /** Resolved id of the static (build mode) mock runtime module. */
  staticMockRuntimeId: string
  /** Resolved directory of the bundled `@histoire/app` build. */
  histoireAppBundledDir: string
  /** Already resolved browser vendors keep virtual imports out of consumer root. */
  histoireVendorIds: PreviewRuntimePreambleOptions['histoireVendorIds']
  /** Story metadata baked into the runtime at transform time. */
  files: PreviewRuntimeStoryFile[]
  /** Maximum time allowed for one variant mount. */
  mountTimeoutMs: number
  /** Emitted `"<story id>": () => import("<module id>")` loader entries. */
  loaders: string[]
  /** Emitted per-story entry loaders; switches the runtime to lazy story metadata. */
  storyEntryLoaders?: string[]
}

/**
 * Builds the emitted module loader entries, one
 * `"<story id>": version => import("<module id>")` per story file (see
 * {@link buildStoryModuleLoader}). The object key goes through
 * `JSON.stringify` so a story id containing a quote, a backslash or a backtick
 * cannot break out of the literal it is baked into.
 * @param files Story files to emit a loader for.
 * @param options Loader options.
 * @param options.hmr Enables the cache-busting form.
 */
export function buildStoryModuleLoaders(files: PreviewRuntimeStoryFile[], { hmr = false } = {}) {
  return files.map(file => `${JSON.stringify(file.id)}: ${buildStoryModuleLoader(file, { hmr })}`)
}

/**
 * Composes the preview runtime source from its sections. Each section owns one
 * coherent part of the emitted module and they are concatenated in the order
 * the runtime executes them, separated by a single blank line.
 *
 * The sections share one module scope, which is the contract between them:
 * every binding a section uses but does not declare comes from an earlier one,
 * and everything shared (the baked `files`/`moduleLoaders`, the imported
 * helpers, `selectionState`, `storyFileCache`, the message-type constants) is
 * declared by the preamble. Function declarations hoist, so a later section may
 * be *called* earlier — but a `const` read during another section's top-level
 * execution must be declared before it, or it is in its temporal dead zone.
 */
export function buildPreviewRuntimeSource(options: PreviewRuntimeSourceOptions) {
  return `
${previewRuntimePreamble(options)}

${previewVitestEnvironment(options.hasVitestPreview)}

${previewHostMessaging()}

${previewErrorOverlay()}

${previewStoryLoading(options.mountTimeoutMs, !!options.storyEntryLoaders)}

${previewVariantBridge()}

${previewElementInspection()}

${previewComponents()}

${previewAppRoot()}

${previewApp()}

${previewMount()}
`
}

/**
 * Bakes the story metadata the generated runtimes embed.
 * @param ctx Histoire context holding the collected story files.
 */
export function getRuntimeStoryFiles(ctx: Context): PreviewRuntimeStoryFile[] {
  return ctx.storyFiles
    .filter(file => !!file.story)
    .map(file => ({
      id: file.id,
      path: file.treePath,
      filePath: file.relativePath,
      docsFilePath: file.markdownFile?.relativePath,
      supportPluginId: file.supportPluginId,
      story: file.story,
      moduleId: file.moduleId,
    }))
}

/**
 * Generates the `virtual:$histoire-preview-runtime` module: the runtime that
 * boots inside Histoire's preview iframe (sandbox). It bakes the collected
 * story metadata and module loaders, so the dev server invalidates this module
 * on every collection.
 */
export function previewRuntime(ctx: Context) {
  const histoireSharedId = resolveHistoireSharedEntry()
  // Sibling virtual modules, resolved from this file's directory.
  const variantTestSessionId = require.resolve('../variant-test-session/index.js')
  const staticMockRuntimeId = require.resolve('../vitest-static-mock-runtime/index.js')
  const hasVitest = hasProjectVitest(ctx.root)
  const vitestSpyId = tryResolveVitestModule(ctx.root, '@vitest/spy')
  const vitestMockerBrowserId = tryResolveVitestModule(ctx.root, '@vitest/mocker/browser')
  const hasVitestPreview = Boolean(hasVitest && vitestSpyId && vitestMockerBrowserId)
  const files = getRuntimeStoryFiles(ctx)
  const hmr = ctx.mode === 'dev'
  const salt = storyEntrySalts.get(ctx) ?? randomUUID()
  storyEntrySalts.set(ctx, salt)
  // Dev documents fetch only their own story's metadata (see story-entries).
  // A build keeps it baked: one hashed bundle is cached by the browser anyway.
  const storyEntryLoaders = hmr ? buildStoryEntryLoaders(files, hmr, salt) : undefined
  const loaders = storyEntryLoaders ? [] : buildStoryModuleLoaders(files, { hmr })

  return buildPreviewRuntimeSource({
    hasVitestPreview,
    vitestSpyId,
    vitestMockerBrowserId,
    histoireSharedId,
    variantTestSessionId,
    staticMockRuntimeId,
    histoireAppBundledDir: resolveHistoireAppBundledDir(),
    // A virtual module has no dependency owner. Resolve from Histoire's package,
    // as with the app build above; consumers need only depend on Histoire.
    histoireVendorIds: {
      floatingVue: require.resolve('@histoire/vendors/floating-vue'),
      pinia: require.resolve('@histoire/vendors/pinia'),
      vue: require.resolve('@histoire/vendors/vue'),
    },
    files,
    loaders,
    storyEntryLoaders,
    mountTimeoutMs: getStoryCollectTimeout(ctx),
  })
}

/**
 * Generates a `virtual:$histoire-preview-story:<id>` entry module from the
 * current collection (see `story-entries.ts`).
 * @param ctx Histoire context holding the collected story files.
 * @param id Resolved entry module id.
 */
export function previewStoryEntry(ctx: Context, id: string) {
  const storyId = parseStoryEntryId(id)
  const file = getRuntimeStoryFiles(ctx).find(item => item.id === storyId)
  return buildStoryEntryModule(file, { hmr: ctx.mode === 'dev' })
}

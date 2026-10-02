import type { SerializedStoryFile } from '../variant-test-session/types.js'
import { STORY_CHANGED_EVENT, TEST_DEFINITIONS_KEY } from '@histoire/shared'
import { MOCK_RPC_SNIPPET } from '../mock-rpc-snippet.js'

/**
 * Story metadata baked into the generated preview runtime, one entry per
 * collected story file. Same shape the session reads back at runtime — the two
 * are passed interchangeably, so they must stay one type.
 */
export type PreviewRuntimeStoryFile = SerializedStoryFile

/**
 * Options of {@link previewRuntimePreamble}.
 */
export interface PreviewRuntimePreambleOptions {
  /**
   * True when Vitest and its mocker packages resolved from the project root.
   * Gates the `@vitest/spy` / `@vitest/mocker` imports and the static mock
   * runtime import, which do not exist in a project without Vitest.
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
  /**
   * Resolved directory of the bundled `@histoire/app` build. Baked as absolute
   * paths because a bare specifier in this virtual module would be resolved
   * from the user's project, which only depends on `histoire`.
   */
  histoireAppBundledDir: string
  /** Vendor entries resolved from Histoire, never the consumer's virtual root. */
  histoireVendorIds: {
    /** Bundled floating-vue browser entry. */
    floatingVue: string
    /** Bundled Pinia browser entry. */
    pinia: string
    /** Bundled Vue browser entry. */
    vue: string
  }
  /** Baked story metadata. */
  files: PreviewRuntimeStoryFile[]
  /** Emitted `"<story id>": () => import("<module id>")` loader entries. */
  loaders: string[]
}

/**
 * Emits the head of the preview runtime: every module import, the story
 * metadata and dynamic module loaders baked at transform time, the sandbox
 * selection parsed from the iframe URL, the plugin API setup and the mock
 * resolution RPC used by the mocker wiring below it.
 */
export function previewRuntimePreamble({
  hasVitestPreview,
  vitestSpyId,
  vitestMockerBrowserId,
  histoireSharedId,
  variantTestSessionId,
  staticMockRuntimeId,
  histoireAppBundledDir,
  histoireVendorIds,
  files,
  loaders,
}: PreviewRuntimePreambleOptions) {
  /** Quotes an absolute specifier for a module of the bundled app build. */
  const app = (subpath: string) => JSON.stringify(`${histoireAppBundledDir}/${subpath}`)

  return `import ${app('util/vitest-mocker-shim.js')}
import 'virtual:$histoire-theme'
${hasVitestPreview
  ? `import { createMockInstance } from ${JSON.stringify(vitestSpyId)}
import { ModuleMocker, ModuleMockerMSWInterceptor } from ${JSON.stringify(vitestMockerBrowserId)}`
  : ''}
import FloatingVue from ${JSON.stringify(histoireVendorIds.floatingVue)}
import { createPinia } from ${JSON.stringify(histoireVendorIds.pinia)}
import { computed, createApp, defineComponent, h, nextTick, onMounted, reactive, ref, watch } from ${JSON.stringify(histoireVendorIds.vue)}
import StoryVariantGridSandbox from ${app('components/story/StoryVariantGridSandbox.vue.js')}
import GenericMountStory from ${app('components/story/GenericMountStory.vue.js')}
import GenericRenderStory from ${app('components/story/GenericRenderStory.vue.js')}
import { setupPluginApi } from ${app('plugin.js')}
import { usePreviewSettingsStore } from ${app('stores/preview-settings.js')}
import { COLLECT_TESTS, CONTROLS_READY, CONTROLS_RESIZE, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, RUN_TESTS, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, TEST_DEFINITIONS, TEST_RESULT, VARIANT_READY } from ${app('util/const.js')}
import { histoireConfig } from ${app('util/config.js')}
import { isDark } from ${app('util/dark.js')}
import { setupControlsDocument } from ${app('util/controls-document.js')}
import { applyPreviewSettings } from ${app('util/preview-settings.js')}
import { toRawDeep } from ${app('util/state.js')}
import { applyVariantStateUpdate, createControlsOverlayBridge, createFailedRunSummary, createVariantStateSyncGuards, getVariantStateKey, serializeTestError } from ${JSON.stringify(histoireSharedId)}
import { createVariantTestSession } from ${JSON.stringify(variantTestSessionId)}
${hasVitestPreview
  ? `import { createStaticPreviewMockRpc, createStaticPreviewMswOptions, enableStaticPreviewMockInterception } from ${JSON.stringify(staticMockRuntimeId)}`
  : ''}

const TEST_DEFINITIONS_KEY = ${JSON.stringify(TEST_DEFINITIONS_KEY)}
const STORY_CHANGED_EVENT = ${JSON.stringify(STORY_CHANGED_EVENT)}
const files = ${JSON.stringify(files)}
const moduleLoaders = {
  ${loaders.join(',\n  ')}
}
const storyFileCache = new Map()
const initialSelection = {
  storyId: new URLSearchParams(window.location.search).get('storyId'),
  variantId: new URLSearchParams(window.location.search).get('variantId'),
  grid: new URLSearchParams(window.location.search).get('grid') === 'true',
  // Controls mode: this sandbox instance renders only the story's custom
  // #controls slot for the host Controls panel (used for vitest-mocked
  // stories, whose module can only execute where the mocker is active).
  controls: new URLSearchParams(window.location.search).get('controls') === 'true',
}
// Story currently displayed, declared here rather than next to the app that
// writes it: the story-loading section reads it several sections earlier, where
// a later declaration would still be in its temporal dead zone.
const selectionState = {
  storyId: initialSelection.storyId,
}

setupPluginApi()

${MOCK_RPC_SNIPPET}`
}

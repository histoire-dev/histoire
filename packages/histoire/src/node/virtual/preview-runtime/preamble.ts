import type { SerializedStoryFile } from '../variant-test-session/types.js'
import { STORY_CHANGED_EVENT, TEST_DEFINITIONS_KEY } from '@histoire/shared'
import { MOCK_RPC_SNIPPET } from '../mock-rpc-snippet.js'
import { previewStoryEntries } from './story-entries.js'

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
  /**
   * True when the book configures at least one frame plugin. Without one the
   * runtime never imports the frame plugin manifest, saving a module request
   * on every interactive document.
   */
  hasFramePlugins: boolean
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
  /** Browser scanner and optional local axe module, present only when enabled and resolved. */
  accessibilityRuntime?: { scannerId: string, axeId: string }
  /**
   * Resolved sandbox entry of the bundled `@histoire/app` build. Baked as absolute
   * paths because a bare specifier in this virtual module would be resolved
   * from the user's project, which only depends on `histoire`.
   */
  histoireAppSandboxId: string
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
  /**
   * Emitted per-story entry loaders (see `buildStoryEntryLoaders`). When set,
   * `files` and `loaders` start empty and each story's metadata and module
   * loader are imported on first use instead of being baked in.
   */
  storyEntryLoaders?: string[]
}

/**
 * Emits the head of the preview runtime: every module import, the story
 * metadata and dynamic module loaders baked at transform time, the sandbox
 * selection parsed from the iframe URL, the plugin API setup and the mock
 * resolution RPC used by the mocker wiring below it.
 */
export function previewRuntimePreamble({
  hasVitestPreview,
  hasFramePlugins,
  vitestSpyId,
  vitestMockerBrowserId,
  histoireSharedId,
  variantTestSessionId,
  staticMockRuntimeId,
  accessibilityRuntime,
  histoireAppSandboxId,
  histoireVendorIds,
  files,
  loaders,
  storyEntryLoaders,
}: PreviewRuntimePreambleOptions) {
  return `import {
  GenericMountStory, GenericRenderStory, setupPluginApi,
  COLLECT_TESTS, CONTROLS_READY, CONTROLS_RESIZE, HOST_CHANNEL_MESSAGE, PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC, RUN_TEST_CASE, RUN_TESTS, RUNTIME_REQUEST, RUNTIME_RESULT, RUNTIME_FAILED,
  RUNTIME_LAYOUT, RUNTIME_FOCUS, SANDBOX_READY, STATE_SYNC, TEST_CASE_RESULT,
  TEST_DEFINITIONS, TEST_RESULT, VARIANT_READY, histoireConfig, isDark, setupControlsDocument,
  applyPreviewSettings, installRuntimeEventScope, installRuntimeHostChannels, toRawDeep,
  getDynamicSourceCode, createRuntimeState, createRuntimeStatePresets,
  createStandalonePresetStorage, observeRuntimeLayout,
} from ${JSON.stringify(histoireAppSandboxId)}
import 'virtual:$histoire-theme'
${hasVitestPreview
  ? `import { createMockInstance } from ${JSON.stringify(vitestSpyId)}
import { ModuleMocker, ModuleMockerMSWInterceptor } from ${JSON.stringify(vitestMockerBrowserId)}`
  : ''}
import FloatingVue from ${JSON.stringify(histoireVendorIds.floatingVue)}
import { createPinia } from ${JSON.stringify(histoireVendorIds.pinia)}
import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from ${JSON.stringify(histoireVendorIds.vue)}
import { ELEMENT_PICK_REQUEST, ELEMENT_PICK_RESULT, MEASURE_REQUEST, MEASURE_RESULT, PROPS_OVERRIDE, STORY_REMOUNT, applyVariantStateUpdate, createControlsOverlayBridge, createControlsStateRevision, createFailedRunSummary, createVariantStateSyncGuards, getFramePurpose, getFrameworkInspection, invalidateFrameworkInspection, getVariantStateKey, isInteractiveFramePurpose, measureWireValue, serializeTestError } from ${JSON.stringify(histoireSharedId)}
import { createVariantTestSession, hasVanillaSetupHooks } from ${JSON.stringify(variantTestSessionId)}
${hasVitestPreview
  ? `import { createStaticPreviewMockRpc, createStaticPreviewMswOptions, enableStaticPreviewMockInterception } from ${JSON.stringify(staticMockRuntimeId)}`
  : ''}

const runtimeAccessibilityAvailable = ${Boolean(accessibilityRuntime)}
/** Load the opt-in scanner and locally installed axe only in the selected document. */
async function scanRuntimeAccessibility(root, selector, options) {
  ${accessibilityRuntime
    ? `const scanner = await import(${JSON.stringify(accessibilityRuntime.scannerId)})
  return scanner.scanAccessibility(root, selector, { ...options, loadAxe: async () => {
    const module = await import('virtual:$histoire-axe-engine')
    return module.default
  } })`
    : `throw Object.assign(new Error('Accessibility audit unavailable'), { code: 'CAPABILITY_UNAVAILABLE' })`}
}

/**
 * Imports the frame plugin manifest (\`FRAME_PLUGINS_ID\`). Only the frame-plugins
 * section calls it, and only in interactive documents. Books without frame
 * plugins get an empty manifest without a module request.
 */
function importFramePluginManifest() {
  return ${hasFramePlugins ? `import('virtual:$histoire-frame-plugins')` : 'Promise.resolve({ framePlugins: [] })'}
}

const TEST_DEFINITIONS_KEY = ${JSON.stringify(TEST_DEFINITIONS_KEY)}
const STORY_CHANGED_EVENT = ${JSON.stringify(STORY_CHANGED_EVENT)}
const files = ${JSON.stringify(storyEntryLoaders ? [] : files)}
const moduleLoaders = {
  ${storyEntryLoaders ? '' : loaders.join(',\n  ')}
}
${storyEntryLoaders ? previewStoryEntries(storyEntryLoaders) : ''}
const storyFileCache = new Map()
${previewInitialSelection()}
// Story currently displayed, declared here rather than next to the app that
// writes it: the story-loading section reads it several sections earlier, where
// a later declaration would still be in its temporal dead zone.
const selectionState = {
  storyId: initialSelection.storyId,
}

setupPluginApi()

${MOCK_RPC_SNIPPET}`
}

/**
 * Emits the `initialSelection` declaration: target, presentation flags and
 * runtime purpose parsed from the sandbox iframe URL. Needs `getFramePurpose`
 * from `@histoire/shared` in scope.
 */
export function previewInitialSelection() {
  return `const initialPurpose = getFramePurpose(new URLSearchParams(window.location.search))
const initialSelection = {
  storyId: new URLSearchParams(window.location.search).get('storyId'),
  variantId: new URLSearchParams(window.location.search).get('variantId'),
  // Controls mode: this sandbox instance renders only the story's custom
  // #controls slot for the host Controls panel (used for vitest-mocked
  // stories, whose module can only execute where the mocker is active).
  controls: initialPurpose === 'controls',
  // Isolated matrix cells consume canonical state without publishing back to it.
  matrix: new URLSearchParams(window.location.search).get('matrix') === 'true',
  // Why this document exists (interactive, test-worker, automation, controls).
  // Matrix cells stay interactive.
  purpose: initialPurpose,
}`
}

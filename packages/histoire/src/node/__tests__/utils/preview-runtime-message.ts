import { createControlsStateRevision } from '@histoire/protocol'
import { vi } from 'vitest'
import {
  COLLECT_TESTS,
  HOST_CHANNEL_MESSAGE,
  PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC,
  RUN_TESTS,
  RUNTIME_REQUEST,
  SANDBOX_READY,
  SELECT_VARIANT,
  STATE_SYNC,
  TEST_DEFINITIONS,
  TEST_RESULT,
} from '../../../../../histoire-app/src/app/util/const.js'
import { previewMessageHandler } from '../../virtual/preview-runtime/message-handler.js'

/**
 * Executes the generated inbound message listener of the preview runtime.
 *
 * The listener is emitted as source text inside the app `setup()` body, so it
 * is run here in a `with` scope that supplies its free identifiers. Anything the
 * exercised branch does not stub resolves to `undefined` (or the real global),
 * which is enough to observe the guard and the two test-related branches.
 */
export function createPreviewRuntime(options: { onCollect?: () => void, onRun?: () => void, controls?: boolean } = {}) {
  const postToParent = vi.fn()
  const collectVariantTests = vi.fn(async () => {
    options.onCollect?.()
    return [{ id: '0', mode: 'run', name: 'a' }]
  })
  const runVariantTests = vi.fn(async () => {
    options.onRun?.()
    return { total: 1, passed: 1, failed: 0, skipped: 0, tests: [] }
  })
  const setCollectedTestDefinitions = vi.fn()
  const syncSelection = vi.fn(async () => {})
  const channelReceive = vi.fn()
  const handleRuntimeRequest = vi.fn()
  const controlsRevision = createControlsStateRevision()
  const applyVariantStateUpdate = vi.fn()
  const handleElementInspection = vi.fn()
  const applyPropsOverride = vi.fn()
  let listener: (event: any) => Promise<void>

  // The window embedding the sandbox, as `getHostWindow()` resolves it.
  const hostWindow = {}
  const story: { value: { id: string } | null } = { value: { id: 'story-a' } }
  const variant: { value: { id: string } | null } = { value: { id: 'variant-a' } }
  const gridSelectedVariantId = { value: 'variant-a' }
  const stubs: Record<string, any> = {
    getHostWindow: () => hostWindow,
    window: {
      location: { origin: 'http://localhost:3000', search: '?mcpNonce=nonce&mcpEpoch=epoch' },
      addEventListener: (type: string, handler: any) => {
        if (type === 'message') {
          listener = handler
        }
      },
    },
    COLLECT_TESTS,
    MEASURE_REQUEST: '__histoire:measure-request',
    ELEMENT_PICK_REQUEST: '__histoire:element-pick-request',
    PROPS_OVERRIDE: '__histoire:props-override',
    reapplyPropsOverride: vi.fn(),
    handleElementInspection,
    applyPropsOverride,
    HOST_CHANNEL_MESSAGE,
    RUNTIME_REQUEST,
    handleRuntimeRequest,
    runtimeHostChannels: { receive: channelReceive },
    previewDocumentId: 'document',
    previewSelectionVersion: 0,
    initialSelection: { controls: options.controls === true },
    controlsRevision,
    mounted: true,
    selection: { grid: false },
    frameworkReadyVariants: new WeakSet(),
    applyVariantStateUpdate,
    getVariantById: vi.fn(),
    variantStateGuards: {},
    PREVIEW_SETTINGS_SYNC,
    PREVIEW_SYNC,
    RUN_TESTS,
    SANDBOX_READY,
    SELECT_VARIANT,
    STATE_SYNC,
    TEST_DEFINITIONS,
    TEST_RESULT,
    postToParent,
    postVariantStateSnapshot: vi.fn(),
    syncSelection,
    story,
    variant,
    gridSelectedVariantId,
    gridSelectionVersion: undefined,
    variantTestSession: { collectVariantTests },
    runVariantTests,
    setCollectedTestDefinitions,
    serializeTestError: (error: Error) => ({ message: error.message }),
    createFailedRunSummary: () => ({ total: 0, passed: 0, failed: 1, skipped: 0, tests: [] }),
  }

  const scope = new Proxy(stubs, {
    has: () => true,
    get: (target, key) => (key in target ? target[key] : (globalThis as any)[key as any]),
  })
  // eslint-disable-next-line no-new-func -- the runtime only exists as source text
  new Function('scope', `with (scope) { ${previewMessageHandler()} }`)(scope)

  return {
    postToParent,
    collectVariantTests,
    runVariantTests,
    syncSelection,
    channelReceive,
    handleRuntimeRequest,
    controlsRevision,
    applyVariantStateUpdate,
    story,
    handleElementInspection,
    applyPropsOverride,
    variant,
    gridSelectedVariantId,
    /** Delivers a message to the runtime, awaiting the async dispatch. */
    async deliver(data: Record<string, any>, overrides: { source?: unknown, origin?: string } = {}) {
      await listener!({
        source: 'source' in overrides ? overrides.source : hostWindow,
        origin: overrides.origin ?? 'http://localhost:3000',
        data,
      })
    },
  }
}

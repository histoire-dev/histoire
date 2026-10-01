import type {
  HistoireCollectTestsPayload,
  HistoireRunTestsPayload,
  HistoireTestCollectionResult,
  HistoireTestDefinitionsPayload,
  HistoireTestResultPayload,
  HistoireTestRunSummary,
} from '@histoire/shared'
import type { PendingRequest } from '../util/preview-request'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { histoireConfig } from '../util/config'
import { COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT } from '../util/const'
import { isTrustedPreviewFrameMessage } from '../util/preview-message'
import { requestFromFrame, settleReply } from '../util/preview-request'

type PreviewMode = 'single' | 'grid'

/**
 * Marker every host <-> preview message carries. The preview runtime drops
 * inbound messages without it, exactly like {@link isTrustedPreviewFrameMessage}
 * does for the replies below.
 */
interface HistoireMessageMarker { __histoire: true }

/** Outbound request asking the preview iframe to collect a variant's tests. */
type CollectTestsMessage = HistoireCollectTestsPayload & HistoireMessageMarker & { type: typeof COLLECT_TESTS }

/** Outbound request asking the preview iframe to run a variant's tests. */
type RunTestsMessage = HistoireRunTestsPayload & HistoireMessageMarker & { type: typeof RUN_TESTS }

/** Default budget for a whole test run inside the iframe (user code). */
const DEFAULT_RUN_TIMEOUT = 300_000

let listenersReady = false
let collectCounter = 0
let runCounter = 0

// Module scope, not store scope: the `message` listener below is installed once
// for the whole module, so slots owned by one store instance would be invisible
// to it as soon as a second pinia instance created another store — its requests
// could then never settle.
const frames = ref<Record<PreviewMode, HTMLIFrameElement | null>>({
  single: null,
  grid: null,
})
let pendingRun: PendingRequest<HistoireTestRunSummary> | null = null
let pendingCollection: PendingRequest<HistoireTestCollectionResult> | null = null

function getCurrentFrame() {
  return frames.value.single ?? frames.value.grid
}

function getCurrentFrameOrigin(frame: HTMLIFrameElement) {
  try {
    return new URL(frame.src || window.location.href, window.location.href).origin
  }
  catch {
    // Never broadcast to '*': the same-origin live preview always lives on the
    // host origin, so fall back to it instead of any origin.
    return window.location.origin
  }
}

/**
 * Rejects in-flight collection/run promises with an explicit reason so the
 * UI does not stay locked on the previous request after an iframe unmount.
 */
function abortPendingRequests(reason: string) {
  if (pendingCollection) {
    const aborted = pendingCollection
    pendingCollection = null
    aborted.reject(new Error(reason))
  }

  if (pendingRun) {
    const aborted = pendingRun
    pendingRun = null
    aborted.reject(new Error(reason))
  }
}

/** Installs the single listener settling the replies of the preview iframe. */
function installReplyListener() {
  if (listenersReady || typeof window === 'undefined') {
    return
  }

  listenersReady = true
  window.addEventListener('message', (event) => {
    // Defense-in-depth: only trust messages from the current preview frame and
    // our own origin (subsumes the legacy `__histoire` marker check) before we
    // resolve any pending collection/run promise by requestId/runId.
    if (!isTrustedPreviewFrameMessage(event, getCurrentFrame())) {
      return
    }

    if (event.data.type === TEST_DEFINITIONS) {
      // Untrusted postMessage data: typed against the reply contract, but
      // every field still defaulted in case the iframe answers a partial one.
      const reply = event.data as Partial<HistoireTestDefinitionsPayload>
      settleReply(
        pendingCollection,
        () => { pendingCollection = null },
        reply.requestId,
        reply.variantKey,
        () => ({
          definitions: reply.definitions ?? [],
          error: reply.error ?? null,
        }),
      )
      return
    }

    if (event.data.type === TEST_RESULT) {
      const reply = event.data as Partial<HistoireTestResultPayload>
      settleReply(
        pendingRun,
        () => { pendingRun = null },
        reply.runId,
        reply.variantKey,
        () => reply.summary as HistoireTestRunSummary,
      )
    }
  })
}

export const usePreviewRuntimeStore = defineStore('preview-runtime', () => {
  installReplyListener()

  function setFrame(mode: PreviewMode, frame: HTMLIFrameElement | null) {
    const previous = frames.value[mode]
    frames.value[mode] = frame

    if (frame === null && !getCurrentFrame()) {
      // No iframe is mounted anymore — abort any in-flight requests so the
      // next collect/run starts fresh instead of waiting on the reply timeout.
      abortPendingRequests('Preview iframe was detached before completing the request.')
    }
    else if (previous && frame && previous !== frame) {
      // The frame was replaced (reloadPreviewFrame): in-flight requests can
      // never be answered by the new frame.
      abortPendingRequests('Preview iframe was reloaded before completing the request.')
    }
  }

  /**
   * Announces that the preview iframe is about to load another document.
   *
   * Story/variant navigation reuses the same iframe element and only swaps its
   * `src`, so `setFrame` sees no change: without this notice the requests only
   * the outgoing document could answer would stall until the reply timeout.
   * Aborting with nothing in flight is a no-op (the grid calls this from an
   * `immediate` watcher that also runs on mount).
   */
  function notifyFrameNavigating() {
    abortPendingRequests('Preview iframe navigated away before completing the request.')
  }

  /**
   * Asks the preview iframe for the tests registered by a variant.
   *
   * @param variantKey - `storyId:variantId` to collect, or null/undefined for
   * whatever the iframe currently has selected.
   */
  async function collectCurrentFrameTests(variantKey?: string | null) {
    return await requestFromFrame<HistoireTestCollectionResult>({
      getPending: () => pendingCollection,
      setPending: (request) => { pendingCollection = request },
      getFrame: getCurrentFrame,
      nextId: () => `${++collectCounter}`,
      timeoutMessage: 'Preview iframe did not return collected tests in time.',
      variantKey,
      post: (frame, requestId) => {
        const message: CollectTestsMessage = {
          __histoire: true,
          type: COLLECT_TESTS,
          requestId,
          variantKey,
        }
        frame.contentWindow?.postMessage(message, getCurrentFrameOrigin(frame))
      },
    })
  }

  /**
   * Runs a variant's tests inside the preview iframe.
   *
   * @param variantKey - `storyId:variantId` to run, or null/undefined for
   * whatever the iframe currently has selected.
   */
  async function runCurrentFrameTests(variantKey?: string | null) {
    return await requestFromFrame<HistoireTestRunSummary>({
      getPending: () => pendingRun,
      setPending: (request) => { pendingRun = request },
      getFrame: getCurrentFrame,
      nextId: () => `${++runCounter}`,
      timeoutMessage: 'Preview iframe did not return test results in time.',
      // A run executes the story's own tests: anything shorter than the
      // configured run budget would fail a suite that is merely slow, and the
      // failure escalates to a full headless run of the SAME tests while the
      // iframe keeps running them (both hitting the story's side effects).
      timeoutMs: histoireConfig.test?.runTimeout ?? DEFAULT_RUN_TIMEOUT,
      variantKey,
      post: (frame, runId) => {
        const message: RunTestsMessage = {
          __histoire: true,
          type: RUN_TESTS,
          runId,
          variantKey,
        }
        frame.contentWindow?.postMessage(message, getCurrentFrameOrigin(frame))
      },
    })
  }

  return {
    collectCurrentFrameTests,
    notifyFrameNavigating,
    setFrame,
    runCurrentFrameTests,
  }
})

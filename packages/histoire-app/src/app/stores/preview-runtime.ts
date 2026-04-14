import type { HistoireSerializedTestDefinition, HistoireTestRunSummary } from '@histoire/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT } from '../util/const'

type PreviewMode = 'single' | 'grid'

let listenersReady = false
let collectCounter = 0
let runCounter = 0

export const usePreviewRuntimeStore = defineStore('preview-runtime', () => {
  const frames = ref<Record<PreviewMode, HTMLIFrameElement | null>>({
    single: null,
    grid: null,
  })

  let pendingRun:
    | {
      id: string
      resolve: (summary: HistoireTestRunSummary) => void
      reject: (error: Error) => void
      variantKey?: string | null
    }
    | null = null
  let pendingCollection:
    | {
      id: string
      resolve: (definitions: HistoireSerializedTestDefinition[]) => void
      reject: (error: Error) => void
      variantKey?: string | null
    }
    | null = null

  if (!listenersReady && typeof window !== 'undefined') {
    listenersReady = true
    window.addEventListener('message', (event) => {
      if (!event.data?.__histoire) {
        return
      }

      if (event.data.type === TEST_DEFINITIONS && pendingCollection) {
        if (String(event.data.requestId) !== pendingCollection.id) {
          return
        }

        if (pendingCollection.variantKey !== undefined && String(event.data.variantKey) !== String(pendingCollection.variantKey)) {
          return
        }

        pendingCollection.resolve(event.data.definitions as HistoireSerializedTestDefinition[])
        pendingCollection = null
        return
      }

      if (event.data.type !== TEST_RESULT || !pendingRun) {
        return
      }

      if (String(event.data.runId) !== pendingRun.id) {
        return
      }

      if (pendingRun.variantKey !== undefined && String(event.data.variantKey) !== String(pendingRun.variantKey)) {
        return
      }

      pendingRun.resolve(event.data.summary as HistoireTestRunSummary)
      pendingRun = null
    })
  }

  function setFrame(mode: PreviewMode, frame: HTMLIFrameElement | null) {
    frames.value[mode] = frame
  }

  function getCurrentFrame() {
    return frames.value.single ?? frames.value.grid
  }

  function getCurrentFrameOrigin(frame: HTMLIFrameElement) {
    try {
      return new URL(frame.src || window.location.href, window.location.href).origin
    }
    catch {
      return '*'
    }
  }

  async function collectCurrentFrameTests(variantKey?: string | null) {
    const frame = getCurrentFrame()
    if (!frame?.contentWindow) {
      throw new Error('Preview iframe is not ready yet.')
    }

    if (pendingCollection) {
      throw new Error('A preview test collection is already active.')
    }

    const requestId = `${++collectCounter}`

    return await new Promise<HistoireSerializedTestDefinition[]>((resolve, reject) => {
      pendingCollection = {
        id: requestId,
        resolve,
        reject,
        variantKey,
      }

      const timeout = window.setTimeout(() => {
        if (!pendingCollection || pendingCollection.id !== requestId) {
          return
        }

        pendingCollection.reject(new Error('Preview iframe did not return collected tests in time.'))
        pendingCollection = null
      }, 15000)

      const clear = () => {
        window.clearTimeout(timeout)
      }

      const originalResolve = pendingCollection.resolve
      const originalReject = pendingCollection.reject
      pendingCollection.resolve = (definitions) => {
        clear()
        originalResolve(definitions)
      }
      pendingCollection.reject = (error) => {
        clear()
        originalReject(error)
      }

      frame.contentWindow?.postMessage({
        type: COLLECT_TESTS,
        requestId,
        variantKey,
      }, getCurrentFrameOrigin(frame))
    })
  }

  async function runCurrentFrameTests(variantKey?: string | null) {
    const frame = getCurrentFrame()
    if (!frame?.contentWindow) {
      throw new Error('Preview iframe is not ready yet.')
    }

    if (pendingRun) {
      throw new Error('A preview test run is already active.')
    }

    const runId = `${++runCounter}`

    return await new Promise<HistoireTestRunSummary>((resolve, reject) => {
      pendingRun = {
        id: runId,
        resolve,
        reject,
        variantKey,
      }

      const timeout = window.setTimeout(() => {
        if (!pendingRun || pendingRun.id !== runId) {
          return
        }

        pendingRun.reject(new Error('Preview iframe did not return test results in time.'))
        pendingRun = null
      }, 15000)

      const clear = () => {
        window.clearTimeout(timeout)
      }

      const originalResolve = pendingRun.resolve
      const originalReject = pendingRun.reject
      pendingRun.resolve = (summary) => {
        clear()
        originalResolve(summary)
      }
      pendingRun.reject = (error) => {
        clear()
        originalReject(error)
      }

      frame.contentWindow?.postMessage({
        type: RUN_TESTS,
        runId,
        variantKey,
      }, getCurrentFrameOrigin(frame))
    })
  }

  return {
    collectCurrentFrameTests,
    setFrame,
    runCurrentFrameTests,
  }
})

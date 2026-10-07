const crypto = require('node:crypto')

const targets = {
  basebutton: {
    storyId: 'src-components-basebutton-story-vue',
    selectedVariantId: 'src-components-basebutton-story-vue-0',
    variantIds: ['src-components-basebutton-story-vue-0', 'src-components-basebutton-story-vue-1', 'src-components-basebutton-story-vue-2'],
  },
  codegen: {
    storyId: 'src-components-codegen-story-vue',
    selectedVariantId: 'html',
    variantIds: ['html', 'props', 'boolean props', 'click-events', 'v-model', 'custom-directive', 'slots', 'slot-with-props', 'slot-with-props-named', 'list', 'function'],
  },
}
const warmupCount = 5
const timedCount = 30
const viewport = { width: 1920, height: 1400 }

/** Installs low-cost host readiness and main-thread instrumentation in every page document. */
function installInstrumentation() {
  const state = window.__crossStoryBench = { pending: null, transitions: [], longTasks: [], eventTimings: [] }
  state.readFrameSnapshot = storyId => [...document.querySelectorAll('.histoire-canvas-frame[data-frame-id]')].flatMap((frame) => {
    let key
    try {
      key = JSON.parse(frame.dataset.frameId)
    }
    catch { return [] }
    if (key[0] !== storyId) return []
    const content = frame.querySelector('.histoire-frame-content')
    const replica = frame.querySelector('.histoire-canvas-replica')
    const iframe = replica?.querySelector('iframe')
    const rect = frame.getBoundingClientRect()
    let documentId = null
    try {
      documentId = new URL(iframe?.src ?? location.href).searchParams.get('documentId')
    }
    catch {}
    return [{
      variantId: key[1],
      admitted: !!iframe,
      ready: !!content && !!replica && !!iframe && content.getAttribute('aria-busy') === 'false' && replica.getAttribute('aria-busy') === 'false' && !content.hasAttribute('inert'),
      selected: !!frame.querySelector('[aria-pressed="true"]'),
      visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      documentId,
      iframeUrl: iframe?.src ?? null,
    }]
  })
  addEventListener('click', (event) => {
    const row = event.target?.closest?.('[data-test-id="story-list-item"]')
    if (!row || !state.pending) return
    let key
    try {
      key = JSON.parse(row.getAttribute('data-tree-key'))
    }
    catch { return }
    if (key[0] !== 'story' || key[1] !== state.pending.storyId) return
    state.pending.treeKey = row.getAttribute('data-tree-key')
    state.pending.inputEventTime = event.timeStamp
    state.pending.handlerTime = performance.now()
    state.transitions.push(state.pending)
    state.pending = null
  }, true)
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration })
    }).observe({ type: 'longtask', buffered: true })
  }
  catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const row = entry.target?.closest?.('[data-test-id="story-list-item"]')
        if (entry.name !== 'click' || !row) continue
        state.eventTimings.push({ treeKey: row.getAttribute('data-tree-key'), startTime: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, duration: entry.duration })
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  }
  catch {}
}

/** Returns a stable build identity for the served entry point and story metadata. */
async function getArtifactIdentity(baseUrl) {
  const [htmlResponse, metadataResponse] = await Promise.all([fetch(`${baseUrl}/`), fetch(`${baseUrl}/histoire.json`)])
  const html = await htmlResponse.text()
  let metadata = null
  try {
    metadata = await metadataResponse.json()
  }
  catch {}
  return {
    indexStatus: htmlResponse.status,
    indexHtmlSha256: crypto.createHash('sha256').update(html).digest('hex'),
    metadataStatus: metadataResponse.status,
    buildInfo: metadata?.buildInfo ?? null,
    buildId: metadata?.capture?.buildId ?? null,
  }
}

/** Calculates nearest-rank percentiles and an interpolated median for comparable samples. */
function describe(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return { count: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1) }
}

/** Builds per-phase request totals and a complete unique script/module URL cost list. */
function summarizeNetwork(requests) {
  const phases = new Map()
  const modules = new Map()
  const sandboxDocuments = []
  for (const request of requests) {
    const phase = phases.get(request.phase) ?? { requestCount: 0, documentRequests: 0, scriptRequests: 0, scriptBytes: 0, sandboxDocumentRequests: 0, sandboxDocumentBytes: 0 }
    phase.requestCount++
    if (request.resourceType === 'document') phase.documentRequests++
    if (request.resourceType === 'script') {
      phase.scriptRequests++
      phase.scriptBytes += request.responseBodyBytes ?? 0
      const module = modules.get(request.url) ?? { url: request.url, requestCount: 0, responseBodyBytes: 0, phases: {} }
      module.requestCount++
      module.responseBodyBytes += request.responseBodyBytes ?? 0
      module.phases[request.phase] = (module.phases[request.phase] ?? 0) + 1
      modules.set(request.url, module)
    }
    if (request.isCanvasSandboxDocument) {
      phase.sandboxDocumentRequests++
      phase.sandboxDocumentBytes += request.responseBodyBytes ?? 0
      sandboxDocuments.push({ phase: request.phase, storyId: request.storyId, variantId: request.variantId, controls: request.controls, status: request.status, bytes: request.responseBodyBytes ?? 0, url: request.url })
    }
    phases.set(request.phase, phase)
  }
  const moduleRows = [...modules.values()].sort((a, b) => b.responseBodyBytes - a.responseBodyBytes)
  return {
    phases: Object.fromEntries(phases),
    scriptModuleCount: moduleRows.length,
    scriptRequestCount: moduleRows.reduce((sum, module) => sum + module.requestCount, 0),
    scriptResponseBodyBytes: moduleRows.reduce((sum, module) => sum + module.responseBodyBytes, 0),
    scriptModules: moduleRows,
    canvasSandboxDocumentCount: sandboxDocuments.length,
    canvasSandboxDocumentBytes: sandboxDocuments.reduce((sum, item) => sum + item.bytes, 0),
    canvasSandboxDocuments: sandboxDocuments,
  }
}

/** Sums browser long-task overlap between click initiation and all-frame readiness. */
function longTaskCost(tasks, start, end) {
  const overlapping = tasks.filter(task => task.startTime < end && task.startTime + task.duration > start)
  return { count: overlapping.length, durationMs: overlapping.reduce((total, task) => total + Math.max(0, Math.min(end, task.startTime + task.duration) - Math.max(start, task.startTime)), 0) }
}

module.exports = { targets, warmupCount, timedCount, viewport, installInstrumentation, getArtifactIdentity, describe, summarizeNetwork, longTaskCost }

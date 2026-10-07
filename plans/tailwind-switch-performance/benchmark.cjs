const fs = require('node:fs')
/** Run after starting dev or static server: node plans/tailwind-switch-performance/benchmark.cjs <base-url> <output-json> [--observe-hidden-mounts]. */
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'examples/vue3')] }))

const [baseUrl, outputPath] = process.argv.slice(2)
const observeHiddenMounts = process.argv.includes('--observe-hidden-mounts')
const variants = [
  { id: 'border-color', label: 'Border Color' },
  { id: 'text-color', label: 'Text Color' },
  { id: 'background-color', label: 'Background Color' },
]
const settleMs = 1200

/** Records selection readiness, browser input timing, long tasks, and document identity. */
function installInstrumentation() {
  const state = window.__tailwindBench = {
    transitions: [],
    longTasks: [],
    eventTimings: [],
    initialFrame: null,
    initialDocument: null,
    replacedFrames: 0,
  }
  /** Marks host admission only after current logical target and retained runtime both report ready. */
  function checkReadiness() {
    const frame = document.querySelector('.histoire-canvas-frame[data-frame-id]')
    if (!frame) return
    let key
    try {
      key = JSON.parse(frame.dataset.frameId)
    }
    catch { return }
    if (key[0] !== 'tailwind') return
    const content = frame.querySelector('.histoire-frame-content')
    const replica = frame.querySelector('.histoire-canvas-replica')
    const iframe = replica?.querySelector('iframe')
    if (!content || !replica || !iframe) return
    if (content.getAttribute('aria-busy') !== 'false' || replica.getAttribute('aria-busy') !== 'false' || content.hasAttribute('inert')) return
    const currentDocument = iframe.contentDocument
    if (!currentDocument) return
    if (!state.initialFrame) {
      state.initialFrame = iframe
      state.initialDocument = currentDocument
    }
    else if (iframe !== state.lastFrame || currentDocument !== state.lastDocument) {
      state.replacedFrames++
    }
    state.lastFrame = iframe
    state.lastDocument = currentDocument

    const pending = state.transitions.find(item => item.readyTime === null)
    if (!pending || key[1] !== pending.targetId) return
    pending.readyTime = performance.now()
    pending.documentId = new URL(iframe.src).searchParams.get('documentId')
    pending.frameCount = document.querySelectorAll('.histoire-canvas-frame').length
    pending.replicaCount = document.querySelectorAll('.histoire-canvas-replica').length
  }

  const observer = new MutationObserver(checkReadiness)
  observer.observe(document.documentElement || document, { subtree: true, childList: true, attributes: true })
  addEventListener('click', (event) => {
    const row = event.target?.closest?.('[data-test-id="story-list-variant"]')
    if (!row) return
    const treeKey = JSON.parse(row.getAttribute('data-tree-key'))
    if (treeKey[1] !== 'tailwind') return
    state.transitions.push({
      targetId: treeKey[2],
      treeKey: row.getAttribute('data-tree-key'),
      label: row.getAttribute('aria-label'),
      inputTime: event.timeStamp,
      handlerTime: performance.now(),
      readyTime: null,
    })
    checkReadiness()
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
        const treeKey = entry.target?.closest?.('[data-test-id="story-list-variant"]')?.getAttribute('data-tree-key')
        if (entry.name === 'click' && treeKey) {
          state.eventTimings.push({
            treeKey,
            startTime: entry.startTime,
            processingStart: entry.processingStart,
            processingEnd: entry.processingEnd,
            duration: entry.duration,
          })
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  }
  catch {}
}

/** Selects one Tailwind story-tree row and waits for destination host readiness. */
async function selectVariant(page, variant) {
  const index = await page.evaluate(() => window.__tailwindBench.transitions.length)
  await page.locator(`[data-test-id="story-list-variant"][aria-label="${variant.label}"]`).click({ timeout: 30000 })
  await page.waitForFunction((i) => {
    const item = window.__tailwindBench.transitions[i]
    return item && Number.isFinite(item.readyTime)
  }, index, { timeout: 30000 })
}

/** Calculates ready latency and long-task overlap after readiness from complete browser timeline. */
function summarize(transitions, longTasks, eventTimings) {
  const measured = transitions.map((item, index) => {
    const matchingEvents = eventTimings.filter(entry => entry.treeKey === item.treeKey && Math.abs(entry.processingStart - item.handlerTime) < 20)
    const event = matchingEvents.sort((a, b) => Math.abs(a.processingStart - item.handlerTime) - Math.abs(b.processingStart - item.handlerTime))[0]
    const inputStart = event?.startTime ?? item.inputTime
    const next = transitions[index + 1]
    const nextEvent = next && eventTimings.filter(entry => entry.treeKey === next.treeKey && Math.abs(entry.processingStart - next.handlerTime) < 20)
      .sort((a, b) => Math.abs(a.processingStart - next.handlerTime) - Math.abs(b.processingStart - next.handlerTime))[0]
    const intervalEnd = next ? (nextEvent?.processingStart ?? next.handlerTime) : item.readyTime + settleMs
    const postReadyLongTaskMs = longTasks.reduce((sum, task) => {
      const taskEnd = task.startTime + task.duration
      return sum + Math.max(0, Math.min(taskEnd, intervalEnd) - Math.max(task.startTime, item.readyTime))
    }, 0)
    return {
      targetId: item.targetId,
      label: item.label,
      inputStart,
      handlerTime: item.handlerTime,
      readyTime: item.readyTime,
      latencyMs: item.readyTime - inputStart,
      inputDelayMs: event ? event.processingStart - event.startTime : null,
      postReadyLongTaskMsUntilNextClick: postReadyLongTaskMs,
      frameCount: item.frameCount,
      replicaCount: item.replicaCount,
      documentId: item.documentId,
    }
  })
  return measured
}

/** Returns nearest-rank percentile for measured values. */
function percentile(sortedValues, p) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * p) - 1)]
}

(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.addInitScript(() => {
    localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
  })
  await page.addInitScript(installInstrumentation)
  const sandboxDocuments = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') {
      const url = new URL(request.url())
      if (url.pathname === '/__sandbox.html' && url.searchParams.get('storyId') === 'tailwind' && url.searchParams.get('controls') !== 'true') sandboxDocuments.push(request.url())
    }
  })
  await page.goto(`${baseUrl}/story/tailwind?variantId=background-color&arrange=single`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.histoire-canvas-replica[aria-busy="false"]').waitFor({ timeout: 60000 })
  await page.evaluate((shouldObserveHiddenMounts) => {
    if (!shouldObserveHiddenMounts) return
    const state = window.__tailwindBench
    if (!state.initialFrame) {
      state.initialFrame = document.querySelector('.histoire-canvas-frame .histoire-canvas-replica iframe')
      state.initialDocument = state.initialFrame?.contentDocument ?? null
    }
    const doc = state.initialDocument
    const stats = state.hiddenMountStats = { added: 0, peakMounted: 0, peakTailwindSamples: 0 }
    const observedRoots = new WeakSet()
    const updateStats = () => {
      const roots = [...doc.querySelectorAll('.__histoire-test-render')]
      const sampleCount = roots.reduce((total, root) => total + root.querySelectorAll('[data-tailwind-token]').length, 0)
      stats.peakMounted = Math.max(stats.peakMounted, roots.length)
      stats.peakTailwindSamples = Math.max(stats.peakTailwindSamples, sampleCount)
    }
    const observeNewRoots = () => {
      for (const root of doc.querySelectorAll('.__histoire-test-render')) {
        if (observedRoots.has(root)) continue
        observedRoots.add(root)
        stats.added++
        new MutationObserver(updateStats).observe(root, { subtree: true, childList: true })
      }
      updateStats()
    }
    new MutationObserver(observeNewRoots).observe(doc.documentElement, { subtree: true, childList: true })
    observeNewRoots()
    state.initialCanvasTailwindSamples = doc.querySelectorAll('[data-tailwind-token]').length
  }, observeHiddenMounts)

  const initialCanvasSandboxDocumentRequests = sandboxDocuments.length
  let variantIndex = 0
  for (let index = 0; index < 5; index++) {
    await selectVariant(page, variants[variantIndex++ % variants.length])
    if ((index + 1) % 5 === 0) process.stdout.write(`[benchmark] warmups ${index + 1}/5 complete\n`)
  }
  for (let index = 0; index < 30; index++) {
    await selectVariant(page, variants[variantIndex++ % variants.length])
    if ((index + 1) % 5 === 0) process.stdout.write(`[benchmark] timed ${index + 1}/30 complete\n`)
  }
  await page.waitForTimeout(settleMs)
  const browserData = await page.evaluate(() => ({
    transitions: window.__tailwindBench.transitions,
    longTasks: window.__tailwindBench.longTasks,
    eventTimings: window.__tailwindBench.eventTimings,
    replacements: window.__tailwindBench.replacedFrames,
    documentId: window.__tailwindBench.transitions[0]?.documentId ?? null,
    iframeCount: document.querySelectorAll('iframe').length,
    canvasFrameCount: document.querySelectorAll('.histoire-canvas-frame').length,
    replicaCount: document.querySelectorAll('.histoire-canvas-replica').length,
    hiddenMountStats: window.__tailwindBench.hiddenMountStats,
    initialCanvasTailwindSamples: window.__tailwindBench.initialCanvasTailwindSamples,
  }))
  const samples = summarize(browserData.transitions, browserData.longTasks, browserData.eventTimings)
    .map((sample, index) => ({ phase: index < 5 ? 'warmup' : 'timed', ...sample }))
  const timed = samples.filter(sample => sample.phase === 'timed')
  const canvasSandboxDocumentRequestsDuringSwitches = Math.max(0, sandboxDocuments.length - initialCanvasSandboxDocumentRequests)
  const latencies = timed.map(item => item.latencyMs).sort((a, b) => a - b)
  const inputDelays = timed.map(item => item.inputDelayMs).filter(Number.isFinite).sort((a, b) => a - b)
  const postReady = timed.map(item => item.postReadyLongTaskMsUntilNextClick).sort((a, b) => a - b)
  const result = {
    nodeVersion: process.version,
    chromiumVersion: browser.version(),
    baseUrl,
    fixture: 'Tailwind generated story, Single view, real story-tree clicks cycling border-color/text-color/background-color',
    viewport: '1400x900',
    warmups: 5,
    timedSwitches: 30,
    summary: {
      medianReadyLatencyMs: (latencies[14] + latencies[15]) / 2,
      p95ReadyLatencyMs: percentile(latencies, 0.95),
      medianInputDelayMs: inputDelays.length ? percentile(inputDelays, 0.5) : null,
      medianPostReadyLongTaskMs: percentile(postReady, 0.5),
      p95PostReadyLongTaskMs: percentile(postReady, 0.95),
    },
    canvasSandboxDocumentRequests: sandboxDocuments.length,
    initialCanvasSandboxDocumentRequests,
    canvasSandboxDocumentRequestsDuringSwitches,
    additionalCanvasSandboxDocumentRequests: canvasSandboxDocumentRequestsDuringSwitches,
    browserState: {
      iframeCount: browserData.iframeCount,
      canvasFrameCount: browserData.canvasFrameCount,
      replicaCount: browserData.replicaCount,
      replacedFrames: browserData.replacements,
      documentId: browserData.documentId,
      hiddenMountStats: browserData.hiddenMountStats,
      initialCanvasTailwindSamples: browserData.initialCanvasTailwindSamples,
    },
    sandboxDocuments,
    switches: samples,
    longTasks: browserData.longTasks,
    eventTimings: browserData.eventTimings,
  }
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
  const summary = {
    summary: result.summary,
    canvasSandboxDocumentRequests: result.canvasSandboxDocumentRequests,
    initialCanvasSandboxDocumentRequests: result.initialCanvasSandboxDocumentRequests,
    canvasSandboxDocumentRequestsDuringSwitches: result.canvasSandboxDocumentRequestsDuringSwitches,
    additionalCanvasSandboxDocumentRequests: result.additionalCanvasSandboxDocumentRequests,
    browserState: result.browserState,
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})

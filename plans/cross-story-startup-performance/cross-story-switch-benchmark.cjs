const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'examples/vue3')] }))
const { targets, warmupCount, timedCount, viewport, installInstrumentation, getArtifactIdentity, describe, summarizeNetwork, longTaskCost } = require('./cross-story-benchmark-utils.cjs')

/** Selects a story through its real story-tree row and waits for its selected and admitted frames. */
async function selectStory(page, targetName, phase) {
  const target = targets[targetName]
  const transitionIndex = await page.evaluate(({ storyId, selectedVariantId, expectedFrameCount, phaseName }) => {
    const state = window.__crossStoryBench
    const index = state.transitions.length
    state.pending = { storyId, selectedVariantId, expectedFrameCount, phase: phaseName, startedAt: performance.now() }
    return index
  }, { storyId: target.storyId, selectedVariantId: target.selectedVariantId, expectedFrameCount: target.variantIds.length, phaseName: phase })
  await page.locator(`[data-test-id="story-list-item"][data-tree-key*="${target.storyId}"]`).click({ timeout: 30000 })
  await page.waitForFunction(({ index, expectedVariantIds }) => {
    const state = window.__crossStoryBench
    const transition = state.transitions[index]
    if (!transition) return false
    const frames = state.readFrameSnapshot(transition.storyId)
    const ready = frames.filter(frame => frame.ready)
    const admittedReady = frames.filter(frame => frame.admitted && frame.ready)
    const selected = frames.find(frame => frame.variantId === transition.selectedVariantId && frame.selected)
    const expected = [...expectedVariantIds].sort()
    const actual = frames.map(frame => frame.variantId).sort()
    if (ready.length > 0 && transition.firstAnyFrameReadyTime === undefined) transition.firstAnyFrameReadyTime = performance.now()
    if (selected?.ready && selected.visible && transition.firstSelectedFrameReadyTime === undefined) transition.firstSelectedFrameReadyTime = performance.now()
    if (frames.length === transition.expectedFrameCount && admittedReady.length === transition.expectedFrameCount && JSON.stringify(actual) === JSON.stringify(expected)) {
      if (transition.allAdmittedFramesReadyTime === undefined) transition.allAdmittedFramesReadyTime = performance.now()
      transition.finalFrames = frames
    }
    return Number.isFinite(transition.firstSelectedFrameReadyTime) && Number.isFinite(transition.allAdmittedFramesReadyTime)
  }, { index: transitionIndex, expectedVariantIds: target.variantIds }, { timeout: 90000, polling: 'raf' })
  return page.evaluate(index => window.__crossStoryBench.transitions[index], transitionIndex)
}

/** Runs the cross-story workload and writes raw samples plus network-module evidence. */
async function run() {
  const [mode, baseUrl, outputPath] = process.argv.slice(2)
  if (!['dev', 'static'].includes(mode) || !baseUrl || !outputPath) throw new Error('Usage: node cross-story-switch-benchmark.cjs <dev|static> <base-url> <output-json>')
  const artifactIdentity = await getArtifactIdentity(baseUrl.replace(/\/$/, ''))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport })
  const requests = []
  const requestRows = new Map()
  const finishWork = []
  let activePhase = 'startup'
  page.on('request', (request) => {
    let frameUrl = null
    try {
      frameUrl = request.frame().url()
    }
    catch {}
    const url = request.url()
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    }
    catch {}
    const row = {
      phase: activePhase,
      resourceType: request.resourceType(),
      url,
      frameUrl,
      storyId: parsedUrl?.searchParams.get('storyId') ?? null,
      variantId: parsedUrl?.searchParams.get('variantId') ?? null,
      controls: parsedUrl?.searchParams.get('controls') === 'true',
      isCanvasSandboxDocument: parsedUrl?.pathname === '/__sandbox.html' && ['src-components-basebutton-story-vue', 'src-components-codegen-story-vue'].includes(parsedUrl.searchParams.get('storyId')) && parsedUrl.searchParams.get('controls') !== 'true',
      responseBodyBytes: null,
      status: null,
      failure: null,
    }
    requests.push(row)
    requestRows.set(request, row)
  })
  page.on('requestfinished', (request) => {
    const row = requestRows.get(request)
    if (!row) return
    const promise = (async () => {
      let sizes = null
      try {
        sizes = await request.sizes()
      }
      catch {}
      let response = null
      try {
        response = await request.response()
      }
      catch {}
      row.status = response?.status() ?? null
      const size = sizes?.responseBodySize
      if (Number.isFinite(size) && size >= 0) {
        row.responseBodyBytes = size
      }
      else {
        const header = Number(response?.headers()['content-length'])
        row.responseBodyBytes = Number.isFinite(header) && header >= 0 ? header : 0
      }
    })()
    finishWork.push(promise)
  })
  page.on('requestfailed', (request) => {
    const row = requestRows.get(request)
    if (row) row.failure = request.failure()?.errorText ?? 'unknown request failure'
  })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 })))
  await page.addInitScript(installInstrumentation)
  const initial = targets.codegen
  const initialUrl = `${baseUrl.replace(/\/$/, '')}/story/${initial.storyId}?variantId=${encodeURIComponent(initial.selectedVariantId)}&arrange=grid`
  await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction((expectedIds) => {
    const frames = window.__crossStoryBench.readFrameSnapshot('src-components-codegen-story-vue')
    return frames.length === expectedIds.length && frames.every(frame => frame.ready) && frames.some(frame => frame.variantId === 'html' && frame.selected)
  }, initial.variantIds, { timeout: 90000, polling: 'raf' })

  const allTransitions = []
  for (let index = 0; index < warmupCount + timedCount; index++) {
    const phase = index < warmupCount ? `warmup-${index + 1}` : `timed-${index - warmupCount + 1}`
    const targetName = index % 2 === 0 ? 'basebutton' : 'codegen'
    activePhase = phase
    const transition = await selectStory(page, targetName, phase)
    allTransitions.push({ ...transition, targetName })
    if ((index + 1) % 5 === 0) process.stdout.write(`[benchmark] selections ${index + 1}/${warmupCount + timedCount} complete\n`)
  }
  activePhase = 'settle'
  await page.waitForTimeout(1000)
  await Promise.allSettled(finishWork)
  const browserData = await page.evaluate(() => ({
    transitions: window.__crossStoryBench.transitions,
    longTasks: window.__crossStoryBench.longTasks,
    eventTimings: window.__crossStoryBench.eventTimings,
    iframeCount: document.querySelectorAll('iframe').length,
    canvasFrameCount: document.querySelectorAll('.histoire-canvas-frame').length,
    replicaCount: document.querySelectorAll('.histoire-canvas-replica').length,
  }))
  const samples = browserData.transitions.map((transition, index) => {
    const target = targets[index % 2 === 0 ? 'basebutton' : 'codegen']
    const matchingEvents = browserData.eventTimings.filter(event => event.treeKey === transition.treeKey && Math.abs(event.processingStart - transition.handlerTime) < 30)
    const event = matchingEvents.sort((a, b) => Math.abs(a.processingStart - transition.handlerTime) - Math.abs(b.processingStart - transition.handlerTime))[0]
    const inputTime = event?.startTime ?? transition.inputEventTime
    const firstSelectedTime = transition.firstSelectedFrameReadyTime
    const allReadyTime = transition.allAdmittedFramesReadyTime
    const longTasksToAllReady = longTaskCost(browserData.longTasks, inputTime, allReadyTime)
    return {
      phase: transition.phase,
      targetName: index % 2 === 0 ? 'basebutton' : 'codegen',
      storyId: transition.storyId,
      selectedVariantId: transition.selectedVariantId,
      expectedFrameCount: target.variantIds.length,
      inputTime,
      handlerTime: transition.handlerTime,
      firstAnyFrameReadyTime: transition.firstAnyFrameReadyTime,
      firstSelectedFrameReadyTime: firstSelectedTime,
      allAdmittedFramesReadyTime: allReadyTime,
      clickToFirstSelectedReadyMs: firstSelectedTime - inputTime,
      clickToAllAdmittedReadyMs: allReadyTime - inputTime,
      inputDelayMs: event ? event.processingStart - event.startTime : null,
      clickEventDurationMs: event?.duration ?? null,
      longTasksToAllAdmittedReady: longTasksToAllReady,
      observedFrames: transition.finalFrames,
    }
  })
  const timed = samples.filter(sample => sample.phase.startsWith('timed-'))
  const byStory = Object.fromEntries(Object.entries(targets).map(([name, target]) => {
    const storySamples = timed.filter(sample => sample.targetName === name)
    return [name, {
      selectedHostReadyMs: describe(storySamples.map(sample => sample.clickToFirstSelectedReadyMs)),
      allAdmittedFramesReadyMs: describe(storySamples.map(sample => sample.clickToAllAdmittedReadyMs)),
      longTaskDurationToAllReadyMs: describe(storySamples.map(sample => sample.longTasksToAllAdmittedReady.durationMs)),
      inputDelayMs: describe(storySamples.map(sample => sample.inputDelayMs)),
      expectedFrameCount: target.variantIds.length,
      actualFrameCounts: [...new Set(storySamples.map(sample => sample.observedFrames.length))],
    }]
  }))
  const network = summarizeNetwork(requests)
  const result = {
    mode,
    baseUrl,
    artifactIdentity,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform} ${os.release()} ${os.arch()}`,
    chromiumVersion: browser.version(),
    viewport: `${viewport.width}x${viewport.height}`,
    arrangement: 'Grid',
    fixture: 'ordinary Vue 3 Code gen (11 variants) and BaseButton (3 variants), switched through real story-tree story rows',
    cacheConditions: 'Fresh Playwright browser context per environment, Chromium default cache enabled, 5 unreported cross-story warmup selections followed by 30 timed alternating selections.',
    warmupSelections: warmupCount,
    timedSelections: timedCount,
    expectedVariants: Object.fromEntries(Object.entries(targets).map(([name, target]) => [name, target.variantIds])),
    summary: { byStory, totalTimedSelections: timed.length },
    browserState: browserData,
    network,
    transitions: samples,
    pageErrors,
  }
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
  process.stdout.write(`${JSON.stringify({ mode, artifactIdentity, summary: result.summary.byStory, scriptRequests: network.scriptRequestCount, scriptModules: network.scriptModuleCount, sandboxDocuments: network.canvasSandboxDocumentCount, sandboxDocumentBytes: network.canvasSandboxDocumentBytes, outputPath })}\n`)
  await browser.close()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

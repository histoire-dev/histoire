import type { ChildProcess } from 'node:child_process'
import type { Browser, Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getProjectServices } from 'histoire/dist/node/api/internal.js'
import { createScreenshotTask } from 'histoire/dist/node/runtime/browser/screenshot.js'
import { createExecutionService } from 'histoire/dist/node/runtime/execution-service.js'
import { getContextScreenshotSetup } from 'histoire/dist/node/runtime/registry.js'
import { getPlaywrightBrowserProcess } from 'histoire/dist/node/util/playwright-kill.js'
import { getDevPreviewHost } from 'histoire/dist/node/vite/mcp-preview-html.js'
import { createHistoireProject } from 'histoire/node'
import { PNG } from 'pngjs'
import { expect, it, vi } from 'vitest'
import { createMcpCaptureProject } from '../../utils/mcp/capture-project.js'

/** Reads RSS only from the exact process owned by the captured Playwright browser. */
async function readOwnedProcessRss(browser: Browser): Promise<number | undefined> {
  if (process.platform !== 'linux') return
  const pid = getPlaywrightBrowserProcess(browser)?.pid
  if (!pid) return
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8')
    const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)
    return match ? Number(match[1]) : undefined
  }
  catch {
    // Exact process RSS may be unavailable after browser teardown or on restricted hosts.
  }
}

/** Waits on exact child-process exit, with a bounded timeout for reportable uncertainty. */
async function waitForOwnedProcessExit(child: ChildProcess | undefined, timeoutMs = 5_000): Promise<boolean> {
  if (!child) return false
  if (child.exitCode !== null || child.signalCode !== null) return true
  return new Promise((resolve) => {
    const onExit = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    /** Settles once and removes both observers. */
    function finish(exited: boolean) {
      clearTimeout(timer)
      child.off('exit', onExit)
      resolve(exited)
    }
    child.once('exit', onExit)
  })
}

/** Starts one real configured project and installs the shared isolation story. */
async function createReuseProject() {
  const fixture = await createMcpCaptureProject()
  await cp(new URL('../../fixtures/mcp-preview/vue/ReuseCapture.story.vue', import.meta.url), resolve(fixture.root, 'ReuseCapture.story.vue'))
  await cp(new URL('../../fixtures/mcp-preview/vue/ReuseCapture.vue', import.meta.url), resolve(fixture.root, 'ReuseCapture.vue'))
  await writeFile(resolve(fixture.root, 'custom config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()], storyMatch:['ReuseCapture.story.vue'], mcp:true, browser:{source:'headless-shell',reuse:true,idleTimeoutMs:30000} };`)
  return { fixture, project: await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' }) }
}

/** Uses an existing exact browser executable/package and never installs browser assets. */
async function spyProjectChromiumLaunch(root: string) {
  const require = createRequire(resolve(root, 'package.json'))
  const entry = require.resolve('playwright')
  const module = await import(pathToFileURL(entry).href) as typeof import('playwright') & { default?: typeof import('playwright') }
  const chromium = module.chromium ?? module.default?.chromium
  if (!chromium) throw new Error('Project Playwright does not expose Chromium')
  return vi.spyOn(chromium, 'launch')
}

/** Builds one screenshot task against the actual generation-owned config and browser owner. */
function createCapture(options: {
  root: string
  host: ReturnType<typeof getDevPreviewHost>
  setupOwner: ReturnType<typeof getContextScreenshotSetup>
  origin: string
  epoch: string
  isActive: () => boolean
  tone: string
  format: 'png' | 'webp'
  observePage: (page: Page) => void
}) {
  return createScreenshotTask({
    root: options.root,
    host: options.host,
    setupOwner: options.setupOwner,
    target: {
      origin: options.origin,
      storyId: 'reuse-capture',
      variantId: 'normal',
      epoch: options.epoch,
      width: 480,
      height: 320,
      deviceScaleFactor: 2,
      propsOverride: { tone: options.tone },
      backgroundColor: 'transparent',
      textDirection: 'ltr',
      isActive: options.isActive,
    },
    observePage: options.observePage,
  }, { format: options.format })
}

it.runIf(process.env.HISTOIRE_BROWSER_REUSE_ACCEPTANCE === '1')('captures five PNG/WebP variants in fresh contexts on one reusable browser process', async () => {
  const { fixture, project } = await createReuseProject()
  let handle: Awaited<ReturnType<typeof project.startDev>> | undefined
  let projectClosed = false
  const launchSpy = await spyProjectChromiumLaunch(fixture.root)
  const timings: number[] = []
  const rssKb: Array<number | undefined> = []
  const contexts: object[] = []
  const browsers: Browser[] = []
  const observations: Array<Record<string, string | null>> = []
  try {
    handle = await project.startDev({ host: '127.0.0.1', port: 0 })
    await handle.ready
    const runtime = getProjectServices(project).dev!.controller.current!
    const setupOwner = getContextScreenshotSetup(runtime.context, runtime.isActive)
    const host = getDevPreviewHost(runtime.server)
    const origin = new URL(handle.url).origin
    const formats = ['png', 'webp', 'png', 'webp', 'png'] as const

    for (let index = 0; index < formats.length; index++) {
      let page: Page | undefined
      const task = createCapture({
        root: fixture.root,
        host,
        setupOwner,
        origin,
        epoch: runtime.epoch,
        isActive: runtime.isActive,
        tone: `tone-${index}`,
        format: formats[index],
        observePage: (value) => { page = value },
      })
      const started = performance.now()
      let output!: Awaited<ReturnType<typeof task.run>>
      let capturedBrowser: Browser | undefined
      try {
        output = await task.run(new AbortController().signal)
        expect(output.result).toMatchObject({ mimeType: formats[index] === 'png' ? 'image/png' : 'image/webp', width: 960, height: 640 })
        const bytes = Buffer.from(output.artifact)
        expect(bytes.byteLength).toBeGreaterThan(0)
        expect(bytes.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024)
        if (formats[index] === 'png') {
          const image = PNG.sync.read(bytes)
          expect([image.width, image.height]).toEqual([960, 640])
        }
        else {
          expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
          expect(bytes.toString('ascii', 8, 12)).toBe('WEBP')
        }

        const observedPage = page!
        const context = observedPage.context()
        capturedBrowser = context.browser() ?? undefined
        if (!capturedBrowser) throw new Error('Captured page lost its owning browser')
        contexts.push(context)
        browsers.push(capturedBrowser)
        observations.push(await observedPage.frameLocator('#histoire-mcp-preview').locator('[data-reuse-capture]').evaluate(element => ({
          tone: element.getAttribute('data-tone'),
          cookie: element.getAttribute('data-cookie-before'),
          storage: element.getAttribute('data-storage-before'),
          html: element.getAttribute('data-html-before'),
          body: element.getAttribute('data-body-before'),
        })))
      }
      finally {
        await task.cleanup?.()
      }
      timings.push(performance.now() - started)
      if (!capturedBrowser) throw new Error('Captured page lost its owning browser')
      rssKb.push(await readOwnedProcessRss(capturedBrowser))
    }

    expect(observations.map(value => value.tone)).toEqual(formats.map((_, index) => `tone-${index}`))
    expect(observations.every(value => !value.cookie && !value.storage && !value.html && !value.body)).toBe(true)
    expect(new Set(contexts).size).toBe(5)
    expect(new Set(browsers).size).toBe(1)
    expect(launchSpy).toHaveBeenCalledOnce()
    const processPids = browsers.map(browser => getPlaywrightBrowserProcess(browser)?.pid)
    const availablePids = processPids.filter((pid): pid is number => typeof pid === 'number')
    if (availablePids.length === browsers.length) expect(new Set(availablePids).size).toBe(1)

    const sortedWarm = timings.slice(1).sort((left, right) => left - right)
    const medianWarmMs = (sortedWarm[1] + sortedWarm[2]) / 2
    const child = getPlaywrightBrowserProcess(browsers[0]) as ChildProcess | undefined
    const teardownStarted = performance.now()
    await handle.close()
    handle = undefined
    await project.close()
    projectClosed = true
    const browserExited = await waitForOwnedProcessExit(child)
    const teardownMs = performance.now() - teardownStarted
    expect(browserExited).toBe(true)
    process.stdout.write(`[browser-reuse-acceptance] ${JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, playwright: createRequire(resolve(fixture.root, 'package.json'))('playwright/package.json').version, browserVersion: browsers[0].version(), coldMs: timings[0], repeatedMs: timings.slice(1), medianRepeatedMs: medianWarmMs, idleRssKb: rssKb, browserPids: availablePids.length === browsers.length ? availablePids : 'unavailable', browserExited, teardownMs })}\n`)
  }
  finally {
    launchSpy.mockRestore()
    await handle?.close()
    if (!projectClosed) await project.close()
    await fixture.close()
  }
}, 120_000)

it.runIf(process.env.HISTOIRE_BROWSER_REUSE_ACCEPTANCE === '1')('discards exact pooled process and quarantines lane when context cleanup hangs', async () => {
  const { fixture, project } = await createReuseProject()
  let handle: Awaited<ReturnType<typeof project.startDev>> | undefined
  const launchSpy = await spyProjectChromiumLaunch(fixture.root)
  try {
    handle = await project.startDev({ host: '127.0.0.1', port: 0 })
    await handle.ready
    const runtime = getProjectServices(project).dev!.controller.current!
    const setupOwner = getContextScreenshotSetup(runtime.context, runtime.isActive)
    let browser: Browser | undefined
    const task = createCapture({
      root: fixture.root,
      host: getDevPreviewHost(runtime.server),
      setupOwner,
      origin: new URL(handle.url).origin,
      epoch: runtime.epoch,
      isActive: runtime.isActive,
      tone: 'held-cleanup',
      format: 'png',
      observePage: (page) => {
        browser = page.context().browser() ?? undefined
        page.context().close = () => new Promise<void>(() => {})
      },
    })
    const execution = createExecutionService({ cleanupTimeoutMs: 5_000 })
    const job = execution.enqueue(task)
    await expect(job.result).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    expect(execution.available).toBe(false)
    expect(launchSpy).toHaveBeenCalledOnce()
    expect(browser?.isConnected()).toBe(false)
    await execution.close().catch(() => {})
  }
  finally {
    launchSpy.mockRestore()
    await handle?.close()
    await project.close()
    await fixture.close()
  }
}, 60_000)

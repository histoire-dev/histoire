import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { createBrowserSetupConsumer, createIsolatedBrowserCache, getCachedChromiumExecutable } from '../../utils/mcp/browser-setup-consumer.js'
import { callMcp, closeMcpFixtures, connectMcpHttp, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

/** Complete a public MCP operation and require its terminal user result. */
async function completeMcpOperation(client: Awaited<ReturnType<typeof connectMcpHttp>>, name: string, arguments_: Record<string, unknown>) {
  const started = await callMcp(client, name, arguments_)
  expect(started.ok, JSON.stringify(started)).toBe(true)
  const terminal = await waitMcp(
    () => callMcp(client, 'histoire_get_operation', { operationId: started.data.operationId }),
    value => ['completed', 'failed', 'cancelled'].includes(value.data?.state),
  )
  expect(terminal.data, JSON.stringify(terminal.data?.error)).toMatchObject({ state: 'completed' })
  return terminal.data.result
}

/** Open one canvas toolbar control whether it is inline or in the overflow menu. */
async function openToolbarControl(page: any, label: string) {
  const control = page.locator(`button[aria-label="${label}"]`)
  if (!await control.isVisible()) {
    await page.getByRole('button', { name: 'More canvas tools', exact: true }).click()
    await control.waitFor({ state: 'visible', timeout: 15_000 })
  }
  await control.click()
}

it.runIf(process.env.HISTOIRE_BROWSER_SETUP_CONSUMER === '1')('proves packed dev MCP, public SDK capture, and toolbar setup/capture with core only', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'histoire browser setup dev consumer '))
  let dev: ReturnType<typeof startMcpProcess> | undefined
  let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
  let browser: any
  let page: any
  let sdkProject: { close: () => Promise<void> } | undefined
  let originalBrowserPath: string | undefined
  let browserPathChanged = false
  try {
    const { consumer, browserPackage } = await createBrowserSetupConsumer(directory)
    const consumerRequire = createRequire(resolve(consumer.root, 'package.json'))
    expect(() => consumerRequire.resolve('playwright')).toThrow()
    expect(consumerRequire.resolve('playwright-core')).toContain('node_modules/playwright-core')

    const shellCache = await createIsolatedBrowserCache(directory, browserPackage, ['chromium-headless-shell'])
    const automationCache = await createIsolatedBrowserCache(resolve(directory, 'automation'), browserPackage, ['chromium'])
    const automationExecutable = await getCachedChromiumExecutable(automationCache, browserPackage.revisions.chromium)
    originalBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH
    process.env.PLAYWRIGHT_BROWSERS_PATH = shellCache
    browserPathChanged = true
    dev = startMcpProcess(['dev', '--host', '127.0.0.1', '--port', '0', '--config', 'histoire.config.ts', '--mcp-port', '0'], consumer.root, {
      PLAYWRIGHT_BROWSERS_PATH: shellCache,
    }, consumer.cli)
    const endpoint = (await dev.waitFor(/MCP:\s*(http:\/\/\S+)/, 120_000))[1]
    const bookUrl = dev.output().match(/Local:\s*(http:\/\/\S+)/)?.[1]
    if (!bookUrl) throw new Error(`Packed dev did not print a local book URL: ${dev.output()}`)
    client = await connectMcpHttp(endpoint)

    const playwright = consumerRequire('playwright-core')
    browser = await playwright.chromium.launch({ executablePath: automationExecutable, headless: true, args: ['--no-sandbox'] })
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`${bookUrl}#/story/browser-setup?variantId=normal&arrange=single`)
    await page.getByRole('button', { name: 'More canvas tools', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Screenshot', exact: true }).click()
    const setup = page.locator('section[aria-label="Screenshot setup"]')
    await expect.poll(() => setup.textContent(), { timeout: 30_000 }).toContain('Setup not checked')
    await setup.getByRole('button', { name: 'Check setup', exact: true }).click()
    await expect.poll(() => setup.count(), { timeout: 30_000 }).toBe(0)
    await page.getByRole('button', { name: 'Capture 1 frame', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })

    await page.getByRole('button', { name: 'Capture 1 frame', exact: true }).click()
    await expect.poll(() => page.locator('.capture-message').textContent(), { timeout: 45_000 }).toBe('1 frame captured')
    const screenshotDirectory = resolve(consumer.root, '.histoire/screenshots')
    await expect.poll(async () => (await readdir(screenshotDirectory).catch(() => [])).filter(file => file.endsWith('.png')).length, { timeout: 15_000 }).toBe(1)
    const saved = (await readdir(screenshotDirectory)).find(file => file.endsWith('.png'))!
    const uiPng = PNG.sync.read(await readFile(resolve(screenshotDirectory, saved)))
    expect(uiPng.width).toBeGreaterThan(0)
    expect(uiPng.height).toBeGreaterThan(0)

    // Resize the Single canvas below the old minimum, then request a small logical viewport through toolbar controls.
    const previousFiles = new Set((await readdir(screenshotDirectory)).filter(file => file.endsWith('.png')))
    await page.setViewportSize({ width: 1280, height: 300 })
    const logicalFrame = page.locator('.histoire-single-frame-shell .histoire-frame-content')
    const logicalHeight = () => logicalFrame.evaluate((element: HTMLElement) => Number.parseFloat(getComputedStyle(element).height))
    await expect.poll(() => logicalFrame.count(), { timeout: 30_000 }).toBe(1)
    await expect.poll(logicalHeight, { timeout: 30_000 }).toBeLessThan(240)
    await openToolbarControl(page, 'Viewport')
    await page.getByLabel('Custom width').fill('128')
    await page.getByLabel('Custom height').fill('96')
    await page.getByLabel('Custom height').press('Enter')
    await expect.poll(logicalHeight, { timeout: 30_000 }).toBe(96)
    await openToolbarControl(page, 'Screenshot')
    await page.getByRole('button', { name: 'Capture 1 frame', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: 'Capture 1 frame', exact: true }).click()
    await expect.poll(async () => (await readdir(screenshotDirectory).catch(() => [])).filter(file => file.endsWith('.png')).length, { timeout: 45_000 }).toBe(2)
    await expect.poll(() => page.locator('.capture-message').textContent(), { timeout: 15_000 }).toBe('1 frame captured')
    const smallFile = (await readdir(screenshotDirectory)).find(file => file.endsWith('.png') && !previousFiles.has(file))!
    const smallPng = PNG.sync.read(await readFile(resolve(screenshotDirectory, smallFile)))
    expect(smallPng.height).toBeGreaterThan(0)
    expect(smallPng.height).toBeLessThan(240)
    expect([smallPng.width, smallPng.height]).toEqual([128, 96])

    const project = await waitMcp(() => callMcp(client!, 'histoire_get_project'), value => value.data?.status === 'ready' && !value.data.updating)
    expect(project.data.capabilities.screenshots.available).toBe(true)
    const inspected = await completeMcpOperation(client, 'histoire_inspect_dom', {
      storyId: 'browser-setup',
      variantId: 'normal',
      requestKey: 'dev-browser-setup-dom',
      selector: '#browser-setup-marker',
      maxNodes: 8,
    })
    expect(inspected).toMatchObject({ matched: true, nodes: [expect.objectContaining({ attributes: expect.objectContaining({ id: 'browser-setup-marker' }), text: 'default' })] })
    expect(inspected.nodes[0].rect.width).toBeGreaterThan(0)
    const devCapture = await completeMcpOperation(client, 'histoire_capture_screenshot', {
      storyId: 'browser-setup',
      variantId: 'normal',
      requestKey: 'dev-browser-setup-capture',
      width: 480,
      height: 320,
      deviceScaleFactor: 2,
    })
    expect(devCapture).toMatchObject({ width: 960, height: 640, mimeType: 'image/png' })

    await page.close()
    page = undefined
    await browser.close()
    browser = undefined
    await client.close()
    client = undefined
    await dev.close()
    dev = undefined

    const { createHistoireProject } = await import(pathToFileURL(consumerRequire.resolve('histoire/node')).href)
    sdkProject = await createHistoireProject({ root: consumer.root, configFile: 'histoire.config.ts' })
    const sdkDev = await createHistoireProjectDev(sdkProject)
    const sdkCapture = await (sdkProject as any).captureScreenshot({ storyId: 'browser-setup', variantId: 'normal', width: 480, height: 320, deviceScaleFactor: 2 })
    expect(sdkCapture).toMatchObject({ width: 960, height: 640, mimeType: 'image/png' })
    const sdkPng = PNG.sync.read(Buffer.from(sdkCapture.png))
    expect([sdkPng.width, sdkPng.height]).toEqual([960, 640])
    await sdkDev.close()
    await sdkProject.close()
    sdkProject = undefined
  }
  finally {
    try {
      await closeMcpFixtures([
        async () => await rm(directory, { recursive: true, force: true }),
        async () => await sdkProject?.close(),
        async () => await dev?.close(),
        async () => await client?.close(),
        async () => await browser?.close(),
        async () => await page?.close(),
      ])
    }
    finally {
      if (browserPathChanged) {
        if (originalBrowserPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH
        else process.env.PLAYWRIGHT_BROWSERS_PATH = originalBrowserPath
      }
    }
  }
}, 600_000)

/** Start SDK development without creating a second MCP listener. */
async function createHistoireProjectDev(project: any) {
  const dev = await project.startDev({ host: '127.0.0.1', port: 0, mcp: false, agents: false })
  await dev.ready
  return dev
}

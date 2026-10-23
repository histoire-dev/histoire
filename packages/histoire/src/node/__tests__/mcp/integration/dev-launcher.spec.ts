import type { Page } from 'playwright'
import { appendFile, cp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createDevLauncherProject, createDevLauncherVueProject } from '../../utils/mcp/dev-launcher-project.js'
import { assertMcpProcessReleased, startMcpProcess } from '../../utils/mcp/process.js'

/** Observe real process ownership, independently of nodemon's lifecycle messages. */
async function state(root: string): Promise<{ pid: number, source: boolean }> {
  return JSON.parse(await readFile(resolve(root, 'launcher-state.json'), 'utf8'))
}

/** A retired process cannot retain the old Node module cache or execution lane. */
function processExists(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

/** Readiness comes from public HTTP listener, not early plugin acquisition telemetry. */
async function ready(url: string) {
  await expect.poll(async () => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok
    }
    catch { return false }
  }, { timeout: 30000, message: 'Replacement must serve original configured port' }).toBe(true)
}

/** Workbench enables execution only after browser has joined current server session. */
async function runButton(page: Page, definitions = 4) {
  page.setDefaultTimeout(15000)
  const rail = page.locator('button[data-shell-pane="tests"]')
  if (await rail.getAttribute('aria-expanded') !== 'true') await rail.click()
  // Collected heading totals prove inventory exists in both built and source UI.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect.poll(() => page.locator('.test-story-heading').textContent(), { timeout: 30000 }).toMatch(new RegExp(`/\\s*${definitions}$`))
  const button = page.getByRole('button', { name: 'Run all', exact: true })
  await expect.poll(() => button.isEnabled(), { timeout: 30000 }).toBe(true)
  return button
}

/** Click public Run all; external requests distinguish fresh execution from stale totals. */
async function runAll(page: Page, requestCount: () => number) {
  const button = await runButton(page)
  const before = requestCount()
  await button.click()
  await expect.poll(requestCount, { timeout: 60000 }).toBe(before + 2)
  await expect.poll(() => button.isEnabled(), { timeout: 60000 }).toBe(true)
  const summary = page.getByRole('region', { name: 'Project test summary' })
  await expect.poll(() => summary.getByLabel('4 passed', { exact: true }).count(), { timeout: 30000 }).toBe(1)
  expect(await summary.getByLabel('0 failed', { exact: true }).count()).toBe(1)
}

/** Wait for rendered actor, excluding hidden controls and inactive variant documents. */
async function rendered(page: Page, name: string) {
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      if (frame.url().includes('__sandbox.html') && await frame.getByRole('button', { name, exact: true }).count()) return true
    }
    return false
  }, { timeout: 30000 }).toBe(true)
}

it('recovers rebuilt example runtime, preserves HMR, and retires interrupted tests', async () => {
  const fixture = await createDevLauncherProject()
  const reservation = createServer()
  const url = await listenOwnedServer(reservation, 0, '127.0.0.1')
  await closeOwnedServer(reservation)
  let hold = false
  const requests: import('node:http').ServerResponse[] = []
  const marker = createServer((_request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    requests.push(response)
    if (!hold) response.end('done')
  })
  let runtime: ReturnType<typeof startMcpProcess> | undefined
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  let latestPid: number | undefined
  let page!: Page
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'Book.story.vue'), `<script lang="ts">
import { onTest } from 'histoire/client'
import { expect, it } from 'vitest'
onTest(({ canvas }) => {
  it('renders owned canvas', () => expect(canvas.querySelector('button')?.textContent).toContain('Normal'))
  it('joins external work', async () => { await fetch('${origin}/body') }, 60000)
})
</script><template><Story id="test-book"><Variant id="normal"><button>Normal</button></Variant><Variant id="second"><button>Normal sibling</button></Variant></Story></template>`)
    runtime = startMcpProcess(['--', '--config', 'custom config.ts', '--port', new URL(url).port, '--host', '127.0.0.1', '--no-mcp'], fixture.root, {}, fixture.launcher)
    await runtime.waitFor(/Local:\s+(http:\/\/\S+)/)
    latestPid = (await state(fixture.root)).pid
    browser = await launchEmbedBrowser()
    page = await browser.newPage()
    await page.goto(`${url}/story/test-book?variantId=normal`)
    await rendered(page, 'Normal')
    await runAll(page, () => requests.length)

    // Defect oracle: direct CLI retains same PID and old execution lane after rebuild.
    const rebuilt = resolve(fixture.repository, 'packages/histoire/dist/node/commands/dev.js')
    let reloaded = page.waitForEvent('domcontentloaded', { timeout: 45000 })
    void reloaded.catch(() => {})
    await Promise.all([appendFile(rebuilt, '\nprocess.env.HISTOIRE_LAUNCHER_BUILD = "after-burst"\n'), appendFile(resolve(fixture.repository, 'packages/histoire/dist/node/bin.js'), '\n// same emitter burst\n')])
    await expect.poll(async () => (await state(fixture.root)).pid, { timeout: 30000, message: 'Package rebuild must replace running Histoire process' }).not.toBe(latestPid)
    expect(processExists(latestPid)).toBe(false)
    latestPid = (await state(fixture.root)).pid
    await ready(url)
    // Vite reconnects existing browser, without manual navigation or process restart.
    await reloaded
    await expect.poll(() => page!.locator('meta[name="launcher-pid"]').getAttribute('content'), { timeout: 30000 }).toBe(String(latestPid))
    await rendered(page, 'Normal')
    expect(await page.locator('meta[name="launcher-build"]').getAttribute('content')).toBe('after-burst')
    await runAll(page, () => requests.length)

    reloaded = page.waitForEvent('domcontentloaded', { timeout: 45000 })
    void reloaded.catch(() => {})
    await writeFile(resolve(fixture.repository, 'packages/histoire-shared/dist/rebuild.json'), JSON.stringify({ revision: 2 }))
    await expect.poll(async () => (await state(fixture.root)).pid, { timeout: 30000 }).not.toBe(latestPid)
    expect(processExists(latestPid)).toBe(false)
    latestPid = (await state(fixture.root)).pid
    await ready(url)
    await reloaded
    await expect.poll(() => page!.locator('meta[name="launcher-pid"]').getAttribute('content'), { timeout: 30000 }).toBe(String(latestPid))
    await rendered(page, 'Normal')
    await runAll(page, () => requests.length)

    const output = resolve(fixture.repository, 'packages/histoire/dist')
    const backup = resolve(fixture.root, 'saved-dist')
    await cp(output, backup, { recursive: true })
    reloaded = page.waitForEvent('domcontentloaded', { timeout: 45000 })
    void reloaded.catch(() => {})
    await rm(output, { recursive: true })
    await expect.poll(() => processExists(latestPid!), { timeout: 30000 }).toBe(false)
    // Actual failed startup proves absence outlasted debounce; supervisor must survive.
    await runtime.waitFor(/app crashed/)
    expect(processExists(runtime.child.pid!)).toBe(true)
    await cp(backup, output, { recursive: true })
    await expect.poll(async () => (await state(fixture.root)).pid, { timeout: 30000 }).not.toBe(latestPid)
    latestPid = (await state(fixture.root)).pid
    await ready(url)
    await reloaded
    await expect.poll(() => page!.locator('meta[name="launcher-pid"]').getAttribute('content'), { timeout: 30000 }).toBe(String(latestPid))
    await rendered(page, 'Normal')
    await runAll(page, () => requests.length)

    hold = true
    const previousRequests = requests.length
    await runButton(page)
    const interrupted = page.evaluate('window.__HST_PLUGIN_API__.sendEvent("runStoryTests", {})').then(result => ({ result }), error => ({ error: String(error) }))
    await expect.poll(() => requests.length, { timeout: 30000 }).toBeGreaterThan(previousRequests)
    reloaded = page.waitForEvent('domcontentloaded', { timeout: 45000 })
    void reloaded.catch(() => {})
    await appendFile(rebuilt, '\n// rebuild while test body awaits response\n')
    await expect.poll(async () => (await state(fixture.root)).pid, { timeout: 45000 }).not.toBe(latestPid)
    expect(processExists(latestPid)).toBe(false)
    latestPid = (await state(fixture.root)).pid
    await ready(url)
    await reloaded
    await expect.poll(() => page!.locator('meta[name="launcher-pid"]').getAttribute('content'), { timeout: 30000 }).toBe(String(latestPid))
    await rendered(page, 'Normal')
    const afterRestart = requests.length
    hold = false
    for (const response of requests) response.end('late response')
    expect(await interrupted).toHaveProperty('error')
    expect(requests.length).toBe(afterRestart)
    await runAll(page, () => requests.length)
    // Story writes use real HMR in existing page; ignores cannot be proved by immediate PID check.
    const story = resolve(fixture.root, 'Book.story.vue')
    await writeFile(story, (await readFile(story, 'utf8')).replace('Normal</button>', 'Normal changed through HMR</button>'))
    await rendered(page, 'Normal changed through HMR')
    const deadline = Date.now() + 2000
    await expect.poll(async () => {
      expect((await state(fixture.root)).pid).toBe(latestPid)
      return Date.now() >= deadline
    }, { timeout: 5000, message: 'Story HMR must not restart server after rebuild debounce' }).toBe(true)

    expect((await state(fixture.root)).source).toBe(false)
    expect(runtime.output().match(/\[nodemon\] restarting due to changes/g)).toHaveLength(5)
  }
  catch (error) {
    throw new Error(`${String(error)}\n${await page?.locator('body').textContent().catch(() => '')}\n${runtime?.output().slice(-6000)}`, { cause: error })
  }
  finally {
    for (const response of requests) response.end()
    await browser?.close()
    await runtime?.close()
    if (latestPid) await assertMcpProcessReleased({ pid: latestPid }, url)
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 240000)

it('retains source UI mode and forwards config path containing spaces', async () => {
  const fixture = await createDevLauncherProject()
  const runtime = startMcpProcess(['--source', '--config', 'custom config.ts', '--port', '0', '--host', '127.0.0.1', '--no-mcp'], fixture.root, {}, fixture.launcher)
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  let url: string | undefined
  let pid: number | undefined
  const diagnostics: string[] = []
  try {
    url = (await runtime.waitFor(/Local:\s+(http:\/\/\S+)/))[1]
    const current = await state(fixture.root)
    pid = current.pid
    expect(current.source).toBe(true)
    browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    page.on('pageerror', error => diagnostics.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text())
    })
    await page.goto(`${url}story/test-book?variantId=normal`)
    await rendered(page, 'Normal')
    expect(await page.locator('script[src*="bundle-main-dev.js"]').getAttribute('src')).toContain('/src/')
  }
  catch (error) {
    throw new Error(`${String(error)}\n${diagnostics.join('\n')}\n${runtime.output().slice(-6000)}`, { cause: error })
  }
  finally {
    await browser?.close()
    await runtime.close()
    if (pid && url) await assertMcpProcessReleased({ pid }, url)
    await fixture.close()
  }
}, 120000)

it('runs Vue example lifecycle tests from workbench before and after package rebuild restart', async () => {
  const fixture = await createDevLauncherVueProject()
  const reservation = createServer()
  const endpoint = await listenOwnedServer(reservation, 0, '127.0.0.1')
  await closeOwnedServer(reservation)
  const runtime = startMcpProcess(['--config', 'custom config.ts', '--port', new URL(endpoint).port, '--host', '127.0.0.1', '--no-mcp'], fixture.root, {}, fixture.launcher)
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  let url: string | undefined
  let pid: number | undefined
  let page!: Page
  const diagnostics: string[] = []
  try {
    url = (await runtime.waitFor(/Local:\s+(http:\/\/\S+)/))[1]
    pid = (await state(fixture.root)).pid
    browser = await launchEmbedBrowser()
    page = await browser.newPage()
    page.on('pageerror', error => diagnostics.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text())
    })
    const results: any[] = []
    page.on('websocket', socket => socket.on('framereceived', (frame) => {
      const message = JSON.parse(String(frame.payload))
      if (message.event === 'histoire:dev-event-result' && message.data?.event === 'runStoryTests') results.push(message.data)
    }))
    await page.goto(`${url}story/src-components-vitestlifecycle-story-vue`)
    await rendered(page, 'Call callback')
    await (await runButton(page, 5)).click()
    await expect.poll(() => results.length, { timeout: 60000 }).toBe(1)
    expect(results[0]).toMatchObject({ result: { ok: true, passed: 5, failed: 0, total: 5 } })
    const reload = page.waitForEvent('domcontentloaded', { timeout: 45000 })
    void reload.catch(() => {})
    // Browser-only app outputs reload through Vite without restarting; Node-loaded outputs restart.
    await writeFile(resolve(fixture.repository, 'packages/histoire-shared/dist/rebuild.json'), JSON.stringify({ revision: 3 }))
    await expect.poll(async () => (await state(fixture.root)).pid, { timeout: 30000 }).not.toBe(pid)
    expect(processExists(pid)).toBe(false)
    pid = (await state(fixture.root)).pid
    await ready(url)
    await reload
    await expect.poll(() => page.locator('meta[name="launcher-pid"]').getAttribute('content'), { timeout: 30000 }).toBe(String(pid))
    await rendered(page, 'Call callback')
    await (await runButton(page, 5)).click()
    await expect.poll(() => results.length, { timeout: 60000 }).toBe(2)
    expect(results[1]).toMatchObject({ result: { ok: true, passed: 5, failed: 0, total: 5 } })
  }
  catch (error) {
    throw new Error(`${String(error)}\n${await page?.locator('body').textContent().catch(() => '')}\n${diagnostics.join('\n')}\n${runtime.output().slice(-6000)}`, { cause: error })
  }
  finally {
    await browser?.close()
    await runtime.close()
    if (pid && url) await assertMcpProcessReleased({ pid }, url)
    await fixture.close()
  }
}, 120000)

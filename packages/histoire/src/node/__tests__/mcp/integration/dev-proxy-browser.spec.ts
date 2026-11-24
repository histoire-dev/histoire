import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { launchEmbedBrowser, STANDALONE_SELECTED_FRAME } from '../../utils/embed/browser.js'
import { createMcpCliProject } from '../../utils/mcp/cli-project.js'
import { startMcpProcess } from '../../utils/mcp/process.js'

// Real Chromium consumes built startup modules, SSE and Vite app. Reduced motion
// and unavailable WebGL use real browser capabilities, never mocked canvas APIs.
it('shows accessible startup in light/dark/reduced-motion and hands deep link to workbench', async () => {
  const fixture = await createMcpCliProject()
  // MCP fixture's hostile explicit ID exercises a separate existing baked-ID
  // issue on SDK hosting too. Ordinary story protects proxy rendering/HMR here.
  const storySource = fixture.source.replace(' id="stdio/a %2E.."', '')
  await writeFile(join(fixture.root, 'Book.story.vue'), storySource)
  const pending = new Set<import('node:http').ServerResponse>()
  let released = false
  const gate = createServer((_request, response) => {
    if (released) response.end('go')
    else pending.add(response)
  })
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject)
    gate.listen(0, '127.0.0.1', resolve)
  })
  const gateUrl = `http://127.0.0.1:${(gate.address() as { port: number }).port}`
  const source = `import {HstVue} from '@histoire/plugin-vue';await fetch('${gateUrl}');export default {plugins:[HstVue()],mcp:false,storyMatch:['*.story.vue']}`
  await writeFile(join(fixture.root, 'custom config.ts'), source)
  await writeFile(join(fixture.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue';export default {base:'/book/',plugins:[vue()]}`)
  const process = startMcpProcess(['dev', '--host', '127.0.0.1', '--port', '0', '--config', 'custom config.ts', '--no-mcp'], fixture.root)
  const browser = await launchEmbedBrowser()
  let page: Awaited<ReturnType<typeof browser.newPage>> | undefined
  const errors: string[] = []
  try {
    const url = (await process.waitFor(/Histoire: (http\S+)/))[1]
    page = await browser.newPage({ viewport: { width: 1100, height: 740 }, colorScheme: 'light' })
    page.on('pageerror', error => errors.push(error.message))
    const asset = page.waitForResponse(response => response.url().endsWith('/__histoire/dev/lifecycle.js'))
    await page.goto(`${url}book/?keep=yes#selected`)
    expect(await page.getByRole('status').textContent()).toBe('Starting')
    expect((await asset).status()).toBe(200)
    await page.screenshot({ path: '/tmp/histoire-dev-startup-light.png' })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: '/tmp/histoire-dev-startup-dark.png' })
    const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' })
    await reduced.goto(url)
    expect(await reduced.getByRole('heading', { name: 'Histoire', exact: true }).isVisible()).toBe(true)
    expect(await reduced.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await reduced.screenshot({ path: '/tmp/histoire-dev-startup-mobile.png' })
    released = true
    for (const response of pending) response.end('go')
    pending.clear()
    await expect.poll(() => page.locator('body[data-histoire-loading]').count(), { timeout: 60_000 }).toBe(0)
    expect(new URL(page.url()).pathname).toBe('/book/')
    expect(new URL(page.url()).searchParams.get('keep')).toBe('yes')
    expect(new URL(page.url()).hash).toBe('#selected')
    await expect.poll(() => page.getByText('Stdio Book', { exact: true }).count(), { timeout: 60_000 }).toBeGreaterThan(0)
    await page.getByText('Stdio Book', { exact: true }).first().click()
    const story = page.frameLocator(STANDALONE_SELECTED_FRAME).locator('[data-test-id="sandbox-render"]')
    await story.getByRole('button', { name: 'Button', exact: true }).waitFor()
    await writeFile(join(fixture.root, 'Book.story.vue'), storySource.replace('>Button<', '>Updated action<'))
    await story.getByRole('button', { name: 'Updated action', exact: true }).waitFor()
    expect(errors).toEqual([])
  }
  catch (error) {
    await page?.screenshot({ path: '/tmp/histoire-dev-handoff-failure.png' })
    console.error({ errors, frames: await Promise.all((page?.frames() ?? []).map(async frame => ({ url: frame.url(), body: (await frame.content()).slice(-1800) }))), output: process.output().slice(-2500) })
    throw error
  }
  finally {
    released = true
    for (const response of pending) response.end('go')
    await browser.close()
    await process.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await fixture.close()
  }
}, 120_000)

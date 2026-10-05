import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { attemptEmbedPrimary } from '../../utils/embed/primary-session.js'

const story = `<script>import {vi} from 'vitest';import {greeting} from './greeting';vi.mock('./greeting',()=>({greeting:vi.fn(()=>'First mock')}))</script><script setup>const message=greeting()</script><template><Story id="hmr"><Variant id="one" :init-state="()=>({count:4})"><template #default="{state}"><button @click="state.count++">{{message}}:{{state.count}}</button></template></Variant></Story></template>`

describe('source-development preview with mocks', () => {
  it('loads mocked modules in sandbox and replaces exact document on same-story HMR', async () => {
    // Concurrent agents edit first-party sources; this fixture watches its own
    // story changes, preserving deterministic source-development HMR evidence.
    const fixture = await createEmbedBridgeFixture({ mode: 'source-dev', story, config: 'vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},', files: { 'greeting.ts': 'export function greeting(){return "Real greeting"}' } })
    const page = await fixture.browser.newPage()
    page.on('pageerror', error => console.error('Source-development browser:', error.message))
    try {
      const html = await fetch(new URL('__embed.html', fixture.bookUrl)).then(response => response.text())
      expect(html).toContain('bundle-embed-dev.js')
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const cold = await attemptEmbedPrimary(page, fixture.bookUrl, { storyId: 'hmr', variantId: 'one' }, 'preview')
      console.warn('Source-development initial mount:', cold ? 'optimizer disconnected source; explicit caller reconnect' : 'ready')
      if (cold) {
        expect(cold).toEqual({ code: 'NOT_CONNECTED', status: 'disconnected', stale: true })
        await page.evaluate('session.dispose()')
        // This explicit test-owned preview finishes raw support-plugin discovery.
        // Cold disconnect above is separate from warmed HMR behavior below.
        const warm = await fixture.browser.newPage()
        warm.on('pageerror', error => console.error('Warm source-development browser:', error.message))
        warm.on('console', (message) => {
          if (message.type() === 'error') console.error('Warm source-development console:', message.text())
        })
        try {
          await warm.goto(new URL('__sandbox.html?storyId=hmr&variantId=one&embed=true', fixture.bookUrl).href)
          await warm.getByRole('button', { name: 'First mock:4', exact: true }).waitFor({ timeout: 60_000 })
        }
        catch (error) {
          console.error('Warm source-development DOM:', (await warm.locator('body').textContent()).slice(0, 2000))
          console.error('Source-development server:', fixture.diagnostics().slice(-4000))
          throw error
        }
        finally {
          await warm.close()
        }
        expect(await attemptEmbedPrimary(page, fixture.bookUrl, { storyId: 'hmr', variantId: 'one' }, 'preview')).toBe(null)
      }
      const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('First mock:4')
      await page.evaluate('session.state.patch({count:8})')
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('First mock:8')
      const oldDocument = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      const oldRevision = await page.evaluate('session.getSnapshot().source.revision')
      const path = join(fixture.root, 'Book.story.vue')
      await writeFile(path, (await readFile(path, 'utf8')).replace('First mock', 'Updated mock'))
      await expect.poll(() => page.evaluate('session.getSnapshot().source.revision'), { timeout: 30_000 }).not.toBe(oldRevision)
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.runtimeId'), { timeout: 30_000 }).not.toBe(oldDocument)
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status'), { timeout: 30_000 }).toBe('ready')
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('Updated mock:4')
      await sandbox().evaluate(documentId => parent.postMessage({ __histoire: true, type: '__histoire:state-sync', documentId, storyId: 'hmr', variantId: 'one', state: { count: 999 } }, location.origin), oldDocument)
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(4)
      await page.evaluate('session.dispose()')
    }
    catch (error) {
      console.error('Source-development snapshot:', await page.evaluate('({source:session.getSnapshot().source,status:session.getSnapshot().status,stale:session.getSnapshot().stale,runtime:session.getSnapshot().runtime})').catch(() => 'unavailable'))
      console.error('Source-development descriptor:', await fetch(new URL('histoire-embed.json', fixture.bookUrl)).then(response => response.json()).then(value => ({ epoch: value.epoch, revision: value.revision })).catch(() => 'unavailable'))
      console.error('Source-development rendered:', await page.frames().find(frame => frame.url().includes('__sandbox.html'))?.locator('body').textContent({ timeout: 1000 }).catch(() => 'unavailable'))
      console.error('Source-development server:', fixture.diagnostics().slice(-4000))
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

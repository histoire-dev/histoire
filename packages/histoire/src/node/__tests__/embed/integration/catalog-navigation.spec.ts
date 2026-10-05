import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { attemptEmbedPrimary } from '../../utils/embed/primary-session.js'

const story = `<template><Story id="race"><Variant id="one" :init-state="()=>({count:4})"><template #default="{state}"><button>one:{{state.count}}</button></template></Variant><Variant id="two" :init-state="()=>({count:4})"><template #default="{state}"><button>two:{{state.count}}</button></template></Variant></Story></template>`

describe('catalog publication during host navigation', () => {
  it('catches up mounted source revision and selection before later runtime work', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', story, files: { 'Guide.story.md': '# Guide before update' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.addInitScript(() => {
        if (window !== window.top) return
        const host = window as any
        const add = MessagePort.prototype.addEventListener
        const remove = MessagePort.prototype.removeEventListener
        const listeners = new WeakMap<MessagePort, Map<EventListenerOrEventListenerObject, EventListener>>()
        // Deliver genuine source publication after a host selection changes.
        // Source messages, transferred ports and iframe trust remain untouched.
        MessagePort.prototype.addEventListener = function (type, listener, options) {
          if (type !== 'message' || !listener) return add.call(this, type, listener, options)
          let bound = listeners.get(this)
          if (!bound) listeners.set(this, bound = new Map())
          let wrapped = bound.get(listener)
          if (!wrapped) {
            wrapped = (event: Event) => {
              const message = (event as MessageEvent).data
              if (!host.__CATALOG_NAVIGATED__ && message?.event === 'catalog.changed' && message.mountId === host.primary?.id) {
                host.__CATALOG_NAVIGATED__ = true
                host.__CATALOG_TARGET__ = message.target
                void host.session.selection.select({ storyId: 'race', variantId: 'two' }).catch((error) => {
                  host.__CATALOG_SELECTION_ERROR__ = error.code
                })
              }
              if (typeof listener === 'function') listener.call(this, event)
              else listener.handleEvent(event)
            }
            bound.set(listener, wrapped)
          }
          return add.call(this, type, wrapped, options)
        }
        // Match SDK listener teardown despite this test-owned delivery hook.
        MessagePort.prototype.removeEventListener = function (type, listener, options) {
          return remove.call(this, type, type === 'message' && listener ? listeners.get(this)?.get(listener) ?? listener : listener, options)
        }
      })
      // Finish cold support-plugin discovery before exercising publication
      // ordering; this caller-owned canvas is separate from the SDK session.
      const warm = await fixture.browser.newPage()
      try {
        await warm.goto(new URL('__sandbox.html?storyId=race&variantId=one&embed=true', fixture.bookUrl).href)
        await warm.getByRole('button', { name: 'one:4', exact: true }).waitFor({ timeout: 60_000 })
      }
      finally { await warm.close() }
      await page.goto(`${fixture.hostOrigin}/host.html`)
      expect(await attemptEmbedPrimary(page, fixture.bookUrl, { storyId: 'race', variantId: 'one' }, 'preview')).toBe(null)
      const revision = await page.evaluate('session.getSnapshot().source.revision')
      await writeFile(join(fixture.root, 'Guide.story.md'), '# Guide after update')
      await expect.poll(() => page.evaluate('window.__CATALOG_NAVIGATED__'), { timeout: 30_000 }).toBe(true)
      expect(await page.evaluate('window.__CATALOG_TARGET__')).toEqual({ storyId: 'race', variantId: 'one' })
      await expect.poll(() => page.evaluate('session.getSnapshot().source.revision'), { timeout: 30_000 }).not.toBe(revision)
      await expect.poll(() => page.evaluate('session.getSnapshot().selection'), { timeout: 30_000 }).toEqual({ storyId: 'race', variantId: 'two' })
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status'), { timeout: 30_000 }).toBe('ready')
      const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await page.evaluate('session.state.patch({count:17})')
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('two:17')
      await page.evaluate('session.settings.update({responsiveWidth:420,responsiveHeight:300})')
      await expect.poll(() => sandbox().evaluate(() => [innerWidth, innerHeight])).toEqual([420, 300])
      // Catalog invalidation can reject initiating selection; never retry it.
      const selectionError = await page.evaluate('window.__CATALOG_SELECTION_ERROR__')
      expect([undefined, 'STALE_REVISION']).toContain(selectionError)
      expect(errors).toEqual([])
      await page.evaluate('session.dispose()')
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

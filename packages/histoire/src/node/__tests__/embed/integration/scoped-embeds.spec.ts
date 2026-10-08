import { describe, expect, it } from 'vitest'
import { createEmbedSnippet, createEmbedUrl } from '../../../../../../histoire-app/src/app/components/embed/snippets.js'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { chooseHistoireSelectOption } from '../../utils/embed/controls.js'
import { createEmbedSfcHostAssets } from '../../utils/embed/sfc-host.js'

const story = `<script>if(typeof window!=='undefined')window.__STORY_IMPORTED__=true</script><script setup>
import { logEvent } from 'histoire/client'
function initial(){return {count:2}}
function clicked(state){state.count++;logEvent('Count changed',state.count)}
</script><template><Story id="normal" title="Normal story" :layout="{type:'grid'}"><Variant id="one" title="First" :init-state="initial"><template #default="{state}"><button @click="clicked(state)">Count:{{state.count}}</button></template></Variant><Variant id="two" title="Second"><button>Second variant</button></Variant></Story></template>`
const files = {
  'Book.story.md': '# Embed documentation\n\n[Other story](./Other.story.vue?variantId=main)\n\n[Local section](#section)\n\n## Section\n\nLocal section content',
  'Other.story.vue': '<template><Story id="other" title="Other story"><Variant id="main"><button>Unrelated story</button></Variant></Story></template>',
}
const hostHtml = '<!doctype html><title>Host title</title><input id="host-field" value="host"><div id="mount"></div><div id="second"></div>'

/** Visible primary excludes controls frames and selects exact parent wrapper. */
function runtime(page: any, parent: string) {
  return page.frames().find(frame => frame.url().includes('__sandbox.html') && !new URL(frame.url()).searchParams.has('controls') && frame.parentFrame()?.url().includes(parent))
}

describe('generated scoped embeds', () => {
  it.each(['dev', 'static', 'source-dev'] as const)('loads copied iframe HTML, panels, defaults, switcher, and framing in %s books', async (mode) => {
    const fixture = await createEmbedBridgeFixture({ mode, story, files, hostHtml, framingHeaders: true, config: `routerMode:'${mode === 'static' ? 'hash' : 'history'}',vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}},optimizeDeps:{noDiscovery:true}},` })
    const page = await fixture.browser.newPage({ viewport: { width: 1300, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const options = { bookUrl: fixture.bookUrl, storyId: 'normal', title: 'Normal story', height: 600, panels: ['controls', 'docs', 'source', 'events'] as const }
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const hostBefore = await page.locator('#host-field').boundingBox()
      // Consume emitted markup without rewriting iframe target or options.
      await page.locator('#mount').evaluate((element, html) => {
        element.innerHTML = html
      }, createEmbedSnippet('iframe', options))
      const embed = page.frameLocator('#mount > iframe')
      await expect.poll(() => runtime(page, 'view=embed')?.getByRole('button', { name: 'Count:2', exact: true }).count(), { timeout: 20_000 }).toBe(1)
      expect(new URL(runtime(page, 'view=embed').url()).searchParams.get('grid')).toBe('false')
      await embed.getByRole('spinbutton', { name: 'count', exact: true }).fill('7')
      await expect.poll(() => runtime(page, 'view=embed')?.getByRole('button', { name: 'Count:7', exact: true }).count()).toBe(1)
      await runtime(page, 'view=embed').getByRole('button', { name: 'Count:7', exact: true }).click()
      await expect.poll(() => runtime(page, 'view=embed')?.getByRole('button', { name: 'Count:8', exact: true }).count()).toBe(1)
      await embed.getByRole('tab', { name: 'Events', exact: true }).click()
      await expect.poll(() => embed.getByRole('button', { name: /Count changed/ }).count()).toBe(1)
      await embed.getByRole('tab', { name: 'Source', exact: true }).click()
      await expect.poll(() => embed.locator('pre').textContent()).toContain('Normal story')
      await embed.getByRole('tab', { name: 'Docs', exact: true }).click()
      await expect.poll(() => embed.getByLabel('Histoire documentation').textContent({ timeout: 500 }), { timeout: 15_000 }).toContain('Embed documentation')
      const popupPromise = page.waitForEvent('popup')
      await embed.getByRole('link', { name: 'Other story', exact: true }).click()
      const popup = await popupPromise
      expect(popup.url()).toContain('/story/other?variantId=main')
      await popup.close()
      expect(await runtime(page, 'view=embed').getByRole('button', { name: 'Count:8' }).count()).toBe(1)
      await embed.getByRole('link', { name: 'Local section', exact: true }).click()
      expect(page.url()).toBe(`${fixture.hostOrigin}/host.html`)
      await chooseHistoireSelectOption(embed, embed, 'Variant', 'Second')
      await expect.poll(() => runtime(page, 'view=embed')?.getByRole('button', { name: 'Second variant', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(await embed.getByRole('button', { name: 'Other story', exact: true }).count()).toBe(0)
      // Fresh neighbor uses authored defaults, independent of edited first embed.
      await page.locator('#second').evaluate((element, html) => {
        element.innerHTML = html
      }, createEmbedSnippet('iframe', { ...options, variantId: 'one', title: 'First', panels: ['controls'] }))
      const neighbor = page.frameLocator('#second > iframe')
      await expect.poll(() => neighbor.getByRole('spinbutton', { name: 'count', exact: true }).inputValue(), { timeout: 15_000 }).toBe('2')
      expect(await neighbor.getByRole('button', { name: 'Variant', exact: true }).count()).toBe(0)
      await page.locator('#mount > iframe').evaluate((element) => {
        element.style.width = '500px'
        element.style.height = '500px'
      })
      await embed.getByRole('tab', { name: 'Controls', exact: true }).click()
      expect((await embed.getByLabel('Canvas', { exact: true }).boundingBox())!.height).toBeGreaterThan(100)
      expect(await embed.getByRole('button', { name: 'Reset state', exact: true }).isVisible()).toBe(true)
      expect(await page.locator('#host-field').boundingBox()).toEqual(hostBefore)
      expect(await page.title()).toBe('Host title')
      expect(await page.evaluate('window.__STORY_IMPORTED__')).toBeUndefined()
      await page.screenshot({ path: `/tmp/histoire-scoped-embed-${mode}.png`, fullPage: true })
      await page.locator('#mount').evaluate(element => element.replaceChildren())
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('view=embed')).length).toBe(1)
      await page.locator('#second').evaluate(element => element.replaceChildren())
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('__sandbox.html')).length).toBe(0)
      await page.goto(`${fixture.deniedOrigin}/host.html`)
      await page.locator('#mount').evaluate((element, html) => {
        element.innerHTML = html
      }, createEmbedSnippet('iframe', options))
      await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-error://'))).toBe(true)
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('executes generated JavaScript and Vue SFC, rejects invalid SDK presentation, and releases primary', async () => {
    const consumer = { body: '' }
    const stylesheet = { body: '', contentType: 'text/css' }
    const fixture = await createEmbedBridgeFixture({ story, files, hostHtml, hostModules: { '/consumer.js': consumer, '/consumer.css': stylesheet } })
    const page = await fixture.browser.newPage({ viewport: { width: 1400, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const options = { bookUrl: fixture.bookUrl, storyId: 'normal', variantId: 'one', title: 'First', height: 600, panels: ['controls'] as const }
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const snippet = createEmbedSnippet('javascript', options)
      const html = snippet.slice(0, snippet.indexOf('<script'))
      const script = snippet.slice(snippet.indexOf('\n', snippet.indexOf('<script')) + 1, snippet.lastIndexOf('</script>'))
      await page.locator('#mount').evaluate((element, html) => {
        element.innerHTML = html
      }, html)
      // Consumer's import map resolves public package name; code stays unchanged.
      await page.evaluate(() => {
        const map = document.createElement('script')
        map.type = 'importmap'
        map.textContent = JSON.stringify({ imports: { '@histoire/sdk': '/sdk.js' } })
        document.head.append(map)
      })
      // Keep genuine browser dynamic import outside Vitest's SSR transform.
      await page.evaluate(`(async()=>{
        const module = new Blob([${JSON.stringify(`${script}\nwindow.sdkEmbed={session,embed,disposeEmbed}`)}], { type: 'text/javascript' });
        const url = URL.createObjectURL(module);
        try { await import(url) } finally { URL.revokeObjectURL(url) }
      })()`)
      const embed = page.frameLocator('#histoire-embed > iframe')
      expect(await embed.getByRole('button', { name: 'Variant', exact: true }).count()).toBe(0)
      await embed.getByRole('spinbutton', { name: 'count', exact: true }).fill('9')
      expect(await page.evaluate('sdkEmbed.session.state.get().then(state=>state.value.count)')).toBe(9)
      const codes = await page.evaluate(`(() => {
        const inputs=[{surface:'preview',presentation:{type:'embed',scope:'variant'}},{surface:'explorer',presentation:{type:'embed',scope:'invalid'}},{surface:'explorer',presentation:{type:'embed',scope:'variant',panels:['tests']}}];
        return inputs.map(options=>{try{sdkEmbed.session.mount(document.querySelector('#second'),options)}catch(error){return error.code}})
      })()`)
      expect(codes).toEqual(['INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'INVALID_ARGUMENT'])
      const assets = await createEmbedSfcHostAssets(createEmbedSnippet('vue', { ...options, variantId: undefined, panels: [] }))
      consumer.body = assets.javascript
      stylesheet.body = assets.stylesheet
      await page.evaluate(`(async()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/consumer.css';document.head.append(link);const {default:component,createApp}=await import('/consumer.js');window.app=createApp(component);app.mount('#second')})()`)
      await expect.poll(() => page.locator('#second').getByLabel('Embedded story: Normal story').count(), { timeout: 15_000 }).toBe(1)
      await expect.poll(() => runtime(page, 'surface=preview')?.getByRole('button', { name: 'Count:2', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      await chooseHistoireSelectOption(page.locator('#second'), page, 'Variant', 'Second')
      await expect.poll(() => runtime(page, 'surface=preview')?.getByRole('button', { name: 'Second variant', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(await page.locator('#second').getByRole('tab').count()).toBe(0)
      await page.evaluate('app.unmount();sdkEmbed.disposeEmbed()')
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('__sandbox.html')).length).toBe(0)
      expect(await page.evaluate('sdkEmbed.session.getSnapshot().status')).toBe('disposed')
      // Remove generated SFC while its source bridge is still starting.
      let requested = false
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(url => url.pathname.endsWith('/__embed.html') && url.searchParams.get('view') === 'bridge', async (route) => {
        requested = true
        await pending
        await route.abort().catch(() => {})
      })
      await page.evaluate(`(async()=>{const {default:component,createApp}=await import('/consumer.js');window.app=createApp(component);app.mount('#second')})()`)
      await expect.poll(() => requested).toBe(true)
      await page.evaluate('app.unmount()')
      release()
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('__embed.html') || frame.url().includes('__sandbox.html')).length).toBe(0)
      expect(await page.locator('#second').getByRole('alert').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('runs escaped exact identities and titles through copied iframe and Vue code', async () => {
    const storyId = '日本語:a/b "quoted" </script>'
    const variantId = '.. / : "variant" </script>'
    const title = 'Title " onload="window.injected=true" </script>'
    const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c')
    const specialStory = `<script setup>const storyId=${literal(storyId)};const variantId=${literal(variantId)}</script><template><Story :id="storyId" title="Exact story"><Variant :id="variantId" title="Exact variant"><button>Exact actor</button></Variant></Story></template>`
    const consumer = { body: '' }
    const stylesheet = { body: '', contentType: 'text/css' }
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', story: specialStory, hostHtml, hostModules: { '/consumer.js': consumer, '/consumer.css': stylesheet } })
    const page = await fixture.browser.newPage()
    try {
      const options = { bookUrl: fixture.bookUrl, storyId, variantId, title, height: 600.5, panels: [] as const }
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.locator('#mount').evaluate((element, html) => {
        element.innerHTML = html
      }, createEmbedSnippet('iframe', options))
      await expect.poll(() => runtime(page, 'view=embed')?.getByRole('button', { name: 'Exact actor' }).count(), { timeout: 15_000 }).toBe(1)
      expect(await page.locator('#mount > iframe').getAttribute('title')).toBe(title)
      expect(await page.evaluate('window.injected')).toBeUndefined()
      const assets = await createEmbedSfcHostAssets(createEmbedSnippet('vue', options))
      consumer.body = assets.javascript
      stylesheet.body = assets.stylesheet
      await page.evaluate(`(async()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/consumer.css';document.head.append(link);const {default:component,createApp}=await import('/consumer.js');window.app=createApp(component);app.mount('#second')})()`)
      await expect.poll(() => runtime(page, 'surface=preview')?.getByRole('button', { name: 'Exact actor' }).count(), { timeout: 15_000 }).toBe(1)
      await page.evaluate('app.unmount()')
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('rejects a missing exact target without falling back to another story', async () => {
    const fixture = await createEmbedBridgeFixture({ story, files })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(createEmbedUrl({ bookUrl: fixture.bookUrl, storyId: 'missing', title: 'Missing', height: 600, panels: [] }))
      await expect.poll(() => page.getByText('Unable to load embed', { exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

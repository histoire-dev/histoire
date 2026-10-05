import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const html = '<!doctype html><html><head><title>Host title</title><link rel="stylesheet" href="/native.css"></head><body><h2 id="anchor">Host anchor</h2><div id="native" style="width:900px;height:360px"></div><div id="docs" style="width:600px;height:300px"></div><div id="source" style="width:600px;height:260px"></div><div id="preview" style="width:600px;height:300px"></div></body></html>'
const story = `<script>import {vi} from 'vitest';vi.mock('./greeting',()=>({greeting:'mocked'}));if(typeof window!=='undefined')window.__STORY_IMPORTS__=(window.__STORY_IMPORTS__||0)+1</script><script setup>import{greeting}from'./greeting';const initState=()=>({label:'first'});function brokenSource(){throw new Error('source slot broke')}</script><template><Story id="docs-main"><Variant id="explicit" source="&lt;Explicit/&gt;"><button>{{greeting}}</button></Variant><Variant id="slot"><template #source>&lt;Slot/&gt;</template><button>slot</button></Variant><Variant id="generated" :init-state="initState"><template #default="{state}"><button>{{state.label}}</button></template></Variant><Variant id="broken"><template #source>{{brokenSource()}}</template><button>broken</button></Variant></Story></template>`
const docs = '# Sibling docs\n\n<h2 id="anchor">Panel anchor</h2>\n\n<img src="image.svg" onerror="window.__ATTACK__=true" style="position:fixed">\n\n<a href="#anchor">Local anchor</a>\n\n[Inline story](./Inline.story.vue?variantId=main)\n\n<script>window.__ATTACK__=true</script><iframe src="https://evil.example"></iframe><style>body{display:none}</style>'

describe('deployed documentation and source panels', () => {
  it('reads copied nested static docs/raw source, sanitizes remote markup and isolates anchors/links', async () => {
    const fixture = await createEmbedBridgeFixture({ story, copiedOutput: true, hostHtml: html, hostModules: await createEmbedVueHostAssets(), files: {
      'greeting.ts': 'export const greeting="original"',
      'Book.story.md': docs,
      'Inline.story.vue': '<template><Story id="inline"><Variant id="main"><p>inline</p></Variant></Story></template><docs lang="md"># Inline docs</docs>',
      'Guide.story.md': '# Standalone docs',
      'public/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="green"/></svg>',
    } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => requests.push(request.url()))
    try {
      await page.setViewportSize({ width: 1200, height: 1500 })
      expect(fixture.outputRoot).toBeTruthy()
      await rm(join(fixture.root, 'Book.story.vue'))
      await rm(join(fixture.root, 'Book.story.md'))
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{const{createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'docs-main',variantId:'explicit'});await session.docs.get('docs-main');await session.source.get({storyId:'docs-main',mode:'raw'})})()`)
      expect(requests.filter(url => url.startsWith(fixture.bookUrl) && /(?:content-view|purify|shiki|vendor-).+\.js/.test(url))).toEqual([])
      const content = await page.evaluate(`(async()=>{
        const{createApp,h,HistoireProvider,HistoireDocs,HistoireSource}=await import('/native.js');
        const docs=await session.docs.get('docs-main');const inline=await session.docs.get('inline');const guide=(await session.catalog.list()).find(story=>story.docsOnly);const standalone=await session.docs.get(guide.id);const source=await session.source.get({storyId:'docs-main',mode:'raw'});
        window.app=createApp({render:()=>h(HistoireProvider,{session},{default:()=>[h(HistoireDocs),h(HistoireSource)]})});app.mount('#native');
        window.docsMount=session.mount(document.querySelector('#docs'),{surface:'docs'});window.sourceMount=session.mount(document.querySelector('#source'),{surface:'source'});await Promise.all([docsMount.ready,sourceMount.ready]);
        return{docs,inline,standalone,source,runtime:session.getSnapshot().runtime.status};
      })()`)
      expect(content).toMatchObject({ docs: { origin: 'sibling' }, inline: { origin: 'inline', body: expect.stringContaining('Inline docs') }, standalone: { origin: 'standalone', body: expect.stringContaining('Standalone docs') }, source: { mode: 'raw', origin: 'file', body: expect.stringContaining('vi.mock') }, runtime: 'absent' })
      await expect.poll(() => page.locator('#native').getByLabel('Histoire documentation').textContent()).toContain('Sibling docs')
      const docsFrame = page.frames().find(frame => frame.url().includes('surface=docs'))!
      const sourceFrame = page.frames().find(frame => frame.url().includes('surface=source'))!
      await expect.poll(() => docsFrame.getByLabel('Histoire documentation').textContent()).toContain('Sibling docs')
      await expect.poll(() => sourceFrame.getByLabel('Histoire source').textContent()).toContain('vi.mock')
      const image = page.locator('#native img')
      expect(await image.getAttribute('src')).toBe(new URL('image.svg', fixture.bookUrl).href)
      await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(40)
      expect(await page.locator('#native').getByLabel('Histoire documentation').locator('script,style,iframe,[onerror],[style]').count()).toBe(0)
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
      expect(await page.evaluate('window.__STORY_IMPORTS__ || window.__ATTACK__')).toBeUndefined()
      expect(await docsFrame.evaluate('window.__STORY_IMPORTS__ || window.__ATTACK__')).toBeUndefined()
      const originalUrl = page.url()
      await page.locator('#native').getByRole('link', { name: 'Local anchor' }).click()
      expect(page.url()).toBe(originalUrl)
      await docsFrame.getByRole('link', { name: 'Inline story' }).click()
      await expect.poll(() => page.evaluate('session.getSnapshot().selection')).toEqual({ storyId: 'inline', variantId: 'main' })
      await expect.poll(() => page.locator('#native').getByLabel('Histoire documentation').textContent()).toContain('Inline docs')
      expect(await page.title()).toBe('Host title')
      expect(page.url()).toBe(originalUrl)
      await page.screenshot({ path: '/tmp/histoire-sdk-docs-source.png', fullPage: true })
      await page.evaluate('app.unmount();docsMount.unmount();sourceMount.unmount();session.dispose()')
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('preserves explicit, slot and generated source inside owned static preview', async () => {
    const fixture = await createEmbedBridgeFixture({ story, hostHtml: html, hostModules: await createEmbedVueHostAssets(), files: { 'greeting.ts': 'export const greeting="original"' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.setViewportSize({ width: 1200, height: 1500 })
      await page.goto(`${fixture.hostOrigin}/host.html`)
      expect(await page.evaluate(`(async()=>{const{createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'docs-main',variantId:'explicit'});try{await session.source.get({storyId:'docs-main',mode:'dynamic'})}catch(error){return error.code}})()`)).toBe('PREVIEW_NOT_READY')
      await page.evaluate(`(async()=>{window.preview=session.mount(document.querySelector('#preview'),{surface:'preview'});await preview.ready;window.source=session.mount(document.querySelector('#source'),{surface:'source'});await source.ready})()`)
      expect(await page.evaluate('session.source.get({storyId:"docs-main",mode:"dynamic"})')).toMatchObject({ origin: 'explicit', body: '<Explicit/>' })
      await page.evaluate('session.selection.select({storyId:"docs-main",variantId:"slot"})')
      expect(await page.evaluate('session.source.get({storyId:"docs-main",mode:"dynamic"})')).toMatchObject({ origin: 'slot', body: '<Slot/>' })
      await page.evaluate('session.selection.select({storyId:"docs-main",variantId:"generated"})')
      expect(await page.evaluate('session.source.get({storyId:"docs-main",mode:"dynamic"})')).toMatchObject({ origin: 'generated', body: expect.stringContaining('first') })
      const frame = page.frames().find(frame => frame.url().includes('surface=source'))!
      await frame.getByRole('button', { name: 'Dynamic', exact: true }).click()
      await expect.poll(() => frame.getByLabel('Histoire source').textContent()).toContain('first')
      await page.evaluate('session.state.patch({label:"updated"})')
      await expect.poll(() => frame.getByLabel('Histoire source').textContent()).toContain('updated')
      await page.evaluate('session.selection.select({storyId:"docs-main",variantId:"broken"})')
      expect(await page.evaluate('(async()=>{try{await session.source.get({storyId:"docs-main",mode:"dynamic"})}catch(error){return{code:error.code,message:error.message}}})()')).toEqual({ code: 'INTERNAL_ERROR', message: 'source slot broke' })
      await expect.poll(() => frame.getByRole('alert').textContent()).toContain('source slot broke')
      expect(await page.evaluate('window.__STORY_IMPORTS__')).toBeUndefined()
      expect(errors).toEqual([])
      await page.evaluate('source.unmount();preview.unmount();session.dispose()')
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

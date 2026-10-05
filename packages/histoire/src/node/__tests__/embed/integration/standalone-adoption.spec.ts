import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<script>if(typeof window!=='undefined')window.__HOST_STORY_IMPORTS__=true</script><script setup>function initial(){return{count:2}}</script><template><Story id="normal" title="Normal story"><Variant id="one" title="First" :init-state="initial"><template #default="{state}"><button @click="state.count++">Count:{{state.count}}</button></template></Variant><Variant id="two" title="Second" :init-state="initial"><template #default="{state}"><button @click="state.count++">Second:{{state.count}}</button></template></Variant></Story></template>`
const files = {
  'Book.story.md': '# Mixed story documentation\n\nMixed documentation needle',
  'Grid.story.vue': '<template><Story id="grid" title="Grid story" :layout="{type:\'grid\'}"><Variant id="first"><button>Grid first</button></Variant><Variant id="second"><button>Grid second</button></Variant></Story></template>',
  'Guide.story.md': '# Guide documentation\n\n<p style="color:purple">Trusted local markup</p>',
  'fixture-command.ts': 'export default {clientAction(_params,context){window.__COMMAND_TARGET__=context.currentStory?.id;context.currentVariant.state.count++}}',
  'fixture-overlap.ts': 'export default {clientAction(_params,context){window.__OVERLAP_COMMAND_TARGET__=context.currentStory?.id}}',
  'fixture-prompt.ts': 'export default {showIf:context=>!!context.currentVariant,getParams({answers,currentVariant}){window.__PARAMS_COUNT__=currentVariant.state.count;return{amount:Number(answers.amount)}},clientAction(params,context){context.currentVariant.state.count+=params.amount}}',
  'fixture-reactive-first.ts': 'export default {showIf:context=>context.currentVariant?.state.count===5,clientAction(){window.__REACTIVE_COMMAND_TARGET__="first"}}',
  'fixture-reactive-intended.ts': 'export default {clientAction(){window.__REACTIVE_COMMAND_TARGET__="intended";window.__REACTIVE_COMMAND_RUNS__=(window.__REACTIVE_COMMAND_RUNS__??0)+1}}',
  'fixture-reactive-other.ts': 'export default {clientAction(){window.__REACTIVE_COMMAND_TARGET__="other"}}',
}

describe('standalone adoption of reusable explorer', () => {
  it.each([{ mode: 'dev', routerMode: 'history' }, { mode: 'static', routerMode: 'hash' }] as const)('preserves $routerMode navigation and legacy preferences with default-disabled $mode source', async ({ mode, routerMode }) => {
    const fixture = await createEmbedBridgeFixture({ mode, embedding: false, story, files, config: `routerMode:'${routerMode}',plugins:[HstVue(),{name:'fixture-commands',commands:[{id:'fixture:inspect',label:'Inspect fixture context',searchText:'verify diagnostic alias',clientSetupFile:'/fixture-command.ts'},{id:'fixture:overlap',label:'Normal story command',clientSetupFile:'/fixture-overlap.ts'},{id:'fixture:prompt',label:'Prompt fixture state',prompts:[{type:'text',field:'amount',label:'Amount',defaultValue:'2'}],clientSetupFile:'/fixture-prompt.ts'},{id:'fixture:reactive-first',label:'Reactive fixture first',clientSetupFile:'/fixture-reactive-first.ts'},{id:'fixture:reactive-intended',label:'Reactive fixture intended',clientSetupFile:'/fixture-reactive-intended.ts'},{id:'fixture:reactive-other',label:'Reactive fixture other',clientSetupFile:'/fixture-reactive-other.ts'}]}],` })
    const page = await fixture.browser.newPage({ viewport: { width: 1400, height: 900 } })
    const errors: string[] = []
    const diagnostics: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`)
    })
    page.on('websocket', socket => socket.on('framereceived', (message) => {
      if (String(message.payload).includes('full-reload')) diagnostics.push(String(message.payload))
    }))
    const route = (value: string) => `${fixture.bookUrl}${routerMode === 'hash' ? '#' : ''}${value}`
    // Passive replicas reorder across navigation; target registered primary iframe.
    const primary = () => page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const primaryCount = () => page.locator('iframe[data-test-id="preview-iframe"]').count()
    const preview = (storyId: string, variantId: string) => page.frames().find((frame) => {
      const url = new URL(frame.url())
      return url.pathname.endsWith('__sandbox.html') && !url.searchParams.has('controls') && url.searchParams.get('storyId') === storyId && url.searchParams.get('variantId') === variantId
    })
    const previewCount = () => page.frames().filter((frame) => {
      const url = new URL(frame.url())
      return url.pathname.endsWith('__sandbox.html') && !url.searchParams.has('controls')
    }).length
    const searchButton = page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: 'Search', exact: true })
    const searchPanel = () => page.locator('[data-test-id="search-modal"]')
    const searchInput = () => searchPanel().getByRole('searchbox', { name: 'Search stories, docs and props', exact: true })
    /** Open rail-owned search panel and await its focus target. */
    async function openSearch() {
      await searchButton.click()
      await expect.poll(() => searchInput().isVisible(), { timeout: 15_000 }).toBe(true)
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('_histoire-sandbox-settings-v3', JSON.stringify({ responsiveWidth: 610, textDirection: 'rtl' }))
        sessionStorage.setItem('histoire-color-scheme', 'light')
      })
      await page.goto(fixture.bookUrl)
      await expect.poll(() => page.getByRole('treeitem', { name: 'Normal story', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(await page.evaluate('window.__HOST_STORY_IMPORTS__')).toBeUndefined()
      expect(await primaryCount()).toBe(0)
      for (const document of ['__embed.html', 'histoire-embed.json']) expect((await fetch(new URL(document, fixture.bookUrl))).status).toBe(404)
      await page.getByRole('treeitem', { name: 'Normal story', exact: true }).click()
      const first = page.getByRole('button', { name: 'First', exact: true })
      await expect.poll(() => first.isEnabled(), { timeout: 15_000 }).toBe(true)
      await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
      await first.click()
      await expect.poll(() => primary().getByRole('button', { name: 'Count:2', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(page.url()).toContain('variantId=one')
      expect(await page.title()).toContain('Normal story')
      expect(await page.evaluate('document.documentElement.dir')).toBe('rtl')
      await page.getByRole('button', { name: 'Show inspector', exact: true }).click()
      await expect.poll(() => page.getByRole('spinbutton', { name: 'count', exact: true }).count()).toBe(1)
      await page.getByRole('spinbutton', { name: 'count', exact: true }).fill('9')
      await expect.poll(() => primary().getByRole('button', { name: 'Count:9', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await page.getByRole('button', { name: 'Manage presets', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Save preset', exact: true }).click()
      await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Remembered')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(() => page.getByRole('button', { name: 'State preset', exact: true }).textContent(), { timeout: 15_000 }).toBe('Preset: Remembered')
      await page.reload()
      await expect.poll(() => primary().getByRole('button', { name: 'Count:9', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      expect(await page.evaluate('window.__HOST_STORY_IMPORTS__')).toBeUndefined()
      await page.getByRole('treeitem', { name: 'Grid story', exact: true }).click()
      await expect.poll(() => preview('grid', 'first')?.getByRole('button', { name: 'Grid first', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      await expect.poll(() => preview('grid', 'second')?.getByRole('button', { name: 'Grid second', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      const descriptor = await page.evaluate(`fetch(${JSON.stringify(new URL(mode === 'dev' ? '__histoire/local/descriptor.json' : 'assets/histoire-local.json', fixture.bookUrl).href)}).then(value=>value.json())`)
      const docs = descriptor.catalog.stories.find((story: any) => story.docsOnly)
      await page.getByRole('treeitem', { name: docs.title, exact: true }).click()
      await expect.poll(() => page.getByLabel('Histoire documentation').textContent(), { timeout: 15_000 }).toContain('Guide documentation')
      await expect.poll(previewCount, { timeout: 15_000 }).toBe(0)
      await page.goBack()
      await expect.poll(() => preview('grid', 'second')?.getByRole('button', { name: 'Grid second', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await page.goto(route('story/normal?variantId=two'))
      await expect.poll(() => primary().getByRole('button', { name: 'Second:2', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await openSearch()
      await searchInput().press('Escape')
      await expect.poll(() => searchPanel().count()).toBe(0)
      expect(await searchButton.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      // Generic controls appear only after canonical selected runtime is ready.
      await page.getByRole('spinbutton', { name: 'count', exact: true }).waitFor({ state: 'visible' })
      // Definition collection owns separate offscreen canvas; focus actual preview.
      await primary().locator('[data-test-id="sandbox-render"]').getByRole('button', { name: 'Second:2', exact: true }).focus()
      await page.keyboard.press('Control+k')
      await expect.poll(() => searchInput().isVisible(), { timeout: 15_000 }).toBe(true)
      const search = searchInput()
      if (mode === 'dev') {
        const beforeCommand = page.url()
        await search.fill('>Normal story command')
        await searchPanel().getByRole('button', { name: 'Normal story command', exact: true }).click()
        await expect.poll(() => page.evaluate('window.__OVERLAP_COMMAND_TARGET__')).toBe('normal')
        expect(page.url()).toBe(beforeCommand)
        await search.fill('>verify diagnostic alias')
        await searchPanel().getByRole('button', { name: 'Inspect fixture context', exact: true }).click()
        await expect.poll(() => page.evaluate('window.__COMMAND_TARGET__')).toBe('normal')
        await expect.poll(() => primary().getByRole('button', { name: 'Second:3', exact: true }).count(), { timeout: 15_000 }).toBe(1)
        await search.fill('>Prompt fixture')
        await searchPanel().getByRole('button', { name: 'Prompt fixture state', exact: true }).click()
        expect(await page.getByRole('textbox', { name: 'Amount', exact: true }).inputValue()).toBe('2')
        await page.locator('form.histoire-command-prompts').locator('button[type="submit"]').click()
        await expect.poll(() => primary().getByRole('button', { name: 'Second:5', exact: true }).count(), { timeout: 15_000 }).toBe(1)
        expect(await page.evaluate('window.__PARAMS_COUNT__')).toBe(3)
        // Runtime state changes command availability while keyboard focus remains on an action.
        await search.fill('>Reactive fixture')
        await searchPanel().getByRole('button', { name: 'Reactive fixture first', exact: true }).waitFor()
        await search.press('ArrowDown')
        await primary().getByRole('button', { name: 'Second:5', exact: true }).evaluate(element => (element as HTMLButtonElement).click())
        await expect.poll(() => primary().getByRole('button', { name: 'Second:6', exact: true }).count()).toBe(1)
        await expect.poll(() => searchPanel().getByRole('button', { name: 'Reactive fixture first', exact: true }).count()).toBe(0)
        await search.press('Enter')
        await expect.poll(() => page.evaluate('window.__REACTIVE_COMMAND_TARGET__')).toBe('intended')
        expect(await page.evaluate('window.__REACTIVE_COMMAND_RUNS__')).toBe(1)
      }
      else {
        await search.fill('>Normal story command')
        await expect.poll(() => searchPanel().getByText('No matches', { exact: true }).isVisible()).toBe(true)
      }
      // Docs result on mixed story must reveal panel and preserve router mode.
      await search.fill('Mixed documentation needle')
      const docsResult = searchPanel().locator('li button').filter({ hasText: 'Normal story' })
      await expect.poll(() => docsResult.count()).toBe(1)
      await docsResult.click()
      await expect.poll(() => page.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')
      await expect.poll(() => page.getByLabel('Histoire documentation').textContent()).toContain('Mixed story documentation')
      expect(page.url()).toContain('tab=docs')
      await page.screenshot({ path: `/tmp/histoire-sdk-14-standalone-${mode}.png` })
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Standalone errors', errors)
      console.error('Standalone diagnostics', diagnostics)
      await page.screenshot({ path: `/tmp/histoire-sdk-14-standalone-${mode}-failure.png` })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

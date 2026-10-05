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
    const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))
    try {
      await page.addInitScript(() => {
        localStorage.setItem('_histoire-sandbox-settings-v3', JSON.stringify({ responsiveWidth: 610, textDirection: 'rtl' }))
        sessionStorage.setItem('histoire-color-scheme', 'light')
      })
      await page.goto(fixture.bookUrl)
      await expect.poll(() => page.getByRole('button', { name: 'Normal story', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(await page.evaluate('window.__HOST_STORY_IMPORTS__')).toBeUndefined()
      expect(sandbox()).toBeUndefined()
      for (const document of ['__embed.html', 'histoire-embed.json']) expect((await fetch(new URL(document, fixture.bookUrl))).status).toBe(404)
      await page.getByRole('button', { name: 'Normal story', exact: true }).click()
      await expect.poll(() => page.getByRole('group', { name: 'Choose variant' }).isVisible(), { timeout: 15_000 }).toBe(true)
      expect(sandbox()).toBeUndefined()
      await page.getByRole('button', { name: 'First', exact: true }).click()
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Count:2', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(page.url()).toContain('variantId=one')
      expect(await page.title()).toContain('Normal story')
      expect(await page.evaluate('document.documentElement.dir')).toBe('rtl')
      await page.getByRole('spinbutton', { name: 'count', exact: true }).fill('9')
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Count:9', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Remembered')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(() => page.getByRole('combobox', { name: 'State preset' }).inputValue(), { timeout: 15_000 }).not.toBe('')
      await page.reload()
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Count:9', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      expect(await page.evaluate('window.__HOST_STORY_IMPORTS__')).toBeUndefined()
      await page.getByRole('button', { name: 'Grid story', exact: true }).click()
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Grid first', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Grid second', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      const descriptor = await page.evaluate(`fetch(${JSON.stringify(new URL(mode === 'dev' ? '__histoire/local/descriptor.json' : 'assets/histoire-local.json', fixture.bookUrl).href)}).then(value=>value.json())`)
      const docs = descriptor.catalog.stories.find((story: any) => story.docsOnly)
      await page.getByRole('button', { name: docs.title, exact: true }).click()
      await expect.poll(() => page.getByLabel('Histoire documentation').textContent(), { timeout: 15_000 }).toContain('Guide documentation')
      await expect.poll(() => sandbox(), { timeout: 15_000 }).toBeUndefined()
      await page.goBack()
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Grid second', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await page.goto(route('story/normal?variantId=two'))
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Second:2', exact: true }).isVisible(), { timeout: 15_000 }).toBe(true)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Search stories and commands' })
      expect(await dialog.isVisible()).toBe(true)
      await page.keyboard.press('Escape')
      expect(await dialog.isVisible()).toBe(false)
      expect(await page.getByRole('button', { name: 'Search', exact: true }).evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.mouse.click(10, 10)
      expect(await dialog.isVisible()).toBe(false)
      // Generic controls appear only after canonical selected runtime is ready.
      await page.getByRole('spinbutton', { name: 'count', exact: true }).waitFor({ state: 'visible' })
      // Definition collection owns separate offscreen canvas; focus actual preview.
      await sandbox()!.locator('[data-test-id="sandbox-render"]').getByRole('button', { name: 'Second:2', exact: true }).focus()
      await page.keyboard.press('Control+k')
      await expect.poll(() => dialog.isVisible(), { timeout: 15_000 }).toBe(true)
      // One keyboard cursor traverses matching stories and commands, without
      // allowing nested story search to consume command activation first.
      const search = page.getByRole('searchbox', { name: 'Search stories and docs' })
      await search.fill('Normal')
      await expect.poll(() => dialog.locator('li button').count()).toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Normal story command', exact: true }).waitFor()
      const storyMatches = await dialog.locator('li button').count()
      const beforeCommand = page.url()
      for (let index = 0; index < storyMatches; index++) await search.press('ArrowDown')
      await search.press('Enter')
      await expect.poll(() => page.evaluate('window.__OVERLAP_COMMAND_TARGET__')).toBe('normal')
      expect(page.url()).toBe(beforeCommand)
      expect(await dialog.isVisible()).toBe(false)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByRole('searchbox', { name: 'Search stories and docs' }).fill('verify diagnostic alias')
      await page.getByRole('button', { name: 'Inspect fixture context', exact: true }).click()
      await expect.poll(() => page.evaluate('window.__COMMAND_TARGET__')).toBe('normal')
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Second:3', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByRole('searchbox', { name: 'Search stories and docs' }).fill('Prompt fixture')
      await page.getByRole('button', { name: 'Prompt fixture state', exact: true }).click()
      expect(await page.getByRole('textbox', { name: 'Amount', exact: true }).inputValue()).toBe('2')
      await page.getByRole('dialog', { name: 'Prompt fixture state', exact: true }).locator('button[type="submit"]').click()
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Second:5', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(await page.evaluate('window.__PARAMS_COUNT__')).toBe(3)
      expect(await dialog.isVisible()).toBe(false)
      // Runtime state changes command availability while palette stays open.
      // Highlight follows command identity even when an earlier row disappears.
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await search.fill('Reactive fixture')
      await dialog.getByRole('button', { name: 'Reactive fixture first', exact: true }).waitFor()
      await dialog.getByText('No matches', { exact: true }).waitFor()
      await search.press('ArrowDown')
      expect(await dialog.getByRole('button', { name: 'Reactive fixture intended', exact: true }).getAttribute('aria-current')).toBe('true')
      await sandbox()!.getByRole('button', { name: 'Second:5', exact: true }).evaluate(element => (element as HTMLButtonElement).click())
      await expect.poll(() => sandbox()?.getByRole('button', { name: 'Second:6', exact: true }).count()).toBe(1)
      await expect.poll(() => dialog.getByRole('button', { name: 'Reactive fixture first', exact: true }).count()).toBe(0)
      expect(await dialog.getByRole('button', { name: 'Reactive fixture intended', exact: true }).getAttribute('aria-current')).toBe('true')
      await search.press('Enter')
      await expect.poll(() => page.evaluate('window.__REACTIVE_COMMAND_TARGET__')).toBe('intended')
      expect(await page.evaluate('window.__REACTIVE_COMMAND_RUNS__')).toBe(1)
      expect(await dialog.isVisible()).toBe(false)
      // Finite definition collection removes its canvas inside same owned runtime.
      await expect.poll(async () => (await page.getByLabel('Collected tests', { exact: true }).textContent())?.trim()).toBe('0')
      expect(page.frames().filter(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))).toHaveLength(1)
      // Docs result on mixed story must reveal panel and preserve router mode.
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await search.fill('Mixed documentation needle')
      const docsResult = dialog.locator('li button').filter({ hasText: 'Normal story' })
      await expect.poll(() => docsResult.count()).toBe(1)
      await docsResult.click()
      await expect.poll(() => page.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')
      await expect.poll(() => page.getByLabel('Histoire documentation').textContent()).toContain('Mixed story documentation')
      expect(await dialog.isVisible()).toBe(false)
      expect(page.url()).toContain('tab=docs')
      await expect.poll(() => sandbox()).toBeUndefined()
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

import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { chooseHistoireSelectOption } from '../../utils/embed/controls.js'

const story = `<script setup>import Target from './Target.vue';function initial(){return{count:2,label:'Initial'}}</script><template><Story id="controls"><Variant id="main" :init-state="initial"><template #default="{state}"><button @click="state.count++">Count:{{state.count}}</button><Target/></template></Variant></Story></template>`
describe('static independent controls surface', () => {
  it('edits canonical state and automatic props, applies presets and survives panel teardown', async () => {
    const fixture = await createEmbedBridgeFixture({ story, files: { 'Target.vue': '<script setup>defineProps({amount:{type:Number,default:3}})</script><template><span>Amount:{{amount}}</span></template>' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});
        await session.connect();await session.selection.select({storyId:'controls',variantId:'main'});
        const preview=document.querySelector('#mount');preview.style.cssText='width:420px;height:240px';window.primary=session.mount(preview,{surface:'preview'});await primary.ready;
        const controls=document.createElement('div');controls.id='controls';controls.style.cssText='width:420px;height:600px';document.body.append(controls);window.panel=session.mount(controls,{surface:'controls'});await panel.ready;
      })()`)
      const panel = page.frames().find(frame => frame.url().includes('surface=controls'))!
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))!
      await panel.getByRole('spinbutton', { name: 'count', exact: true }).fill('9')
      await expect.poll(() => sandbox.getByRole('button', { name: 'Count:9', exact: true }).isVisible()).toBe(true)
      await panel.getByRole('spinbutton', { name: 'amount', exact: true }).fill('15')
      await expect.poll(() => sandbox.getByText('Amount:15', { exact: true }).isVisible()).toBe(true)
      await panel.getByRole('button', { name: 'Remove amount override', exact: true }).click()
      await expect.poll(() => sandbox.getByText('Amount:3', { exact: true }).isVisible()).toBe(true)
      await panel.getByRole('button', { name: 'Manage presets', exact: true }).click()
      await panel.getByRole('menuitem', { name: 'Save preset', exact: true }).click()
      await panel.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Saved')
      await panel.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(() => panel.getByRole('button', { name: 'State preset', exact: true }).textContent()).toBe('Saved')
      await page.evaluate('session.state.patch({count:22})')
      await chooseHistoireSelectOption(panel, panel, 'State preset', 'Initial state')
      await expect.poll(() => page.evaluate('session.state.get().then(state=>state.value.count)')).toBe(2)
      await chooseHistoireSelectOption(panel, panel, 'State preset', 'Saved')
      await expect.poll(() => page.evaluate('session.state.get().then(state=>state.value.count)')).toBe(9)
      await page.evaluate('panel.unmount()')
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
      await sandbox.getByRole('button', { name: 'Count:9', exact: true }).click()
      await expect.poll(() => page.evaluate('session.state.get().then(state=>state.value.count)')).toBe(10)
      await page.screenshot({ path: '/tmp/histoire-sdk-10-static-controls.png' })
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Static controls snapshot', await page.evaluate('session.getSnapshot().state'))
      console.error('Static controls frames', page.frames().map(frame => frame.url()))
      await page.screenshot({ path: '/tmp/histoire-sdk-10-static-controls-failure.png' })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

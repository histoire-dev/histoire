import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<script setup>import Child from './ChannelChild.vue'</script><template><Story id="channel:book" title="Channels"><Variant id="one" title="First"><Child label="one"/></Variant><Variant id="two:beta" title="Second"><Child label="two"/></Variant></Story></template>`
const child = `<script setup>
import {ref,onUnmounted} from 'vue';import {useHostChannel} from 'histoire/client';import Late from './ChannelLate.vue';
const props=defineProps(['label']);const channel=useHostChannel('factory');const show=ref(false);const received=ref('none');
let denied;try{useHostChannel('unlisted')}catch(error){denied=error.code}
const close=channel.on('host',data=>{received.value=data.value;void channel.post('ack',{label:props.label,value:data.value})});
const reveal=channel.on('reveal',()=>show.value=true);const failure=channel.on('failure',async()=>{throw new Error('Story consumer failure')});onUnmounted(()=>{close();reveal();failure()});
if(typeof window!=='undefined'){window.channelActors??={};window.channelActors[props.label]={denied,post:()=>channel.post('actor',{label:props.label}),burst:()=>Promise.all(Array.from({length:55},()=>channel.post('actor',{label:props.label}).then(()=>null,error=>error.code))),dropped:()=>channel.getDroppedCount()}}
</script><template><p>{{label}}: {{received}}</p><Late v-if="show" :label="label"/></template>`
const late = `<script setup>import {useHostChannel} from 'histoire/client';const props=defineProps(['label']);const channel=useHostChannel('factory');function send(){void channel.post('late',{label:props.label})}</script><template><button @click="send">Late {{label}}</button></template>`

describe('opt-in host application channels', () => {
  for (const mode of ['dev', 'static'] as const) {
    it(`relays exact grid actors, bounded JSON and lifecycle for ${mode} cross-origin source`, async () => {
      const fixture = await createEmbedBridgeFixture({ mode, copiedOutput: mode === 'static', channels: ['factory', 'other'], story, files: { 'ChannelChild.vue': child, 'ChannelLate.vue': late }, config: mode === 'dev' ? 'vite:{optimizeDeps:{noDiscovery:true}},' : undefined })
      const page = await fixture.browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      try {
        await page.goto(`${fixture.hostOrigin}/host.html`)
        await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();window.messages=[];window.channel=session.channels.open('factory');window.stop=channel.subscribe(value=>messages.push(value));window.denied=(()=>{try{session.channels.open('unlisted')}catch(error){return error.code}})();window.beforeReady=await channel.post('host',null).then(()=>null,error=>error.code)})()`)
        expect(await page.evaluate('denied')).toBe('CAPABILITY_UNAVAILABLE')
        expect(await page.evaluate('beforeReady')).toBe('PREVIEW_NOT_READY')
        expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
        await page.evaluate(`(async()=>{await session.selection.select({storyId:'channel:book',variantId:'one'});window.mount=session.mount(document.querySelector('#mount'),{surface:'grid'});await mount.ready})()`)
        const frame = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
        await expect.poll(() => frame.getByText('two: none', { exact: true }).count()).toBe(1)
        expect(await frame.evaluate('channelActors.one.denied')).toBe('CAPABILITY_UNAVAILABLE')
        await page.evaluate(`window.stopFailure=channel.subscribe(async()=>{throw new Error('Host consumer failure')})`)
        await frame.evaluate('Promise.all([channelActors.one.post(),channelActors.two.post()])')
        await expect.poll(() => page.evaluate('messages.length')).toBe(2)
        await expect.poll(() => page.evaluate('channel.getDroppedCount()')).toBe(2)
        await page.evaluate('stopFailure()')
        expect(await page.evaluate('messages.map(message=>message.target.variantId).sort()')).toEqual(['one', 'two:beta'])
        expect(await page.evaluate('messages.every(message=>message.runtimeId===session.getSnapshot().runtime.runtimeId)')).toBe(true)
        await frame.evaluate(`(()=>{for(const patch of [{documentId:'retired'},{channel:{name:'factory',type:'malformed',data:new Date()}},{channel:{name:'unlisted',type:'malformed',data:null}}])parent.postMessage({__histoire:true,type:'__histoire:host-channel',documentId:window.__HST_PREVIEW_DOCUMENT_ID__,storyId:'channel:book',variantId:'one',channel:{name:'factory',type:'malformed',data:null},...patch},location.origin)})()`)
        await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        expect(await page.evaluate('messages.length')).toBe(2)
        await page.evaluate(`channel.post('host',{value:'selected-first',command:'selection.select',url:'https://invalid.example'})`)
        await expect.poll(() => frame.getByText('one: selected-first', { exact: true }).count()).toBe(1)
        expect(await frame.getByText('two: none', { exact: true }).count()).toBe(1)
        expect(await page.evaluate('session.getSnapshot().selection.variantId')).toBe('one')
        await page.evaluate(`channel.post('failure',null)`)
        await expect.poll(() => frame.evaluate('channelActors.one.dropped()')).toBe(1)
        await page.evaluate(`(async()=>{const selection=session.selection.select({storyId:'channel:book',variantId:'two:beta'});window.transitionMessages=[];window.stopTransition=channel.subscribe(value=>transitionMessages.push(value));await selection})()`)
        await frame.evaluate('channelActors.one.post()')
        await expect.poll(() => page.evaluate(`messages.filter(message=>message.type==='actor'&&message.target.variantId==='one').length`)).toBe(2)
        await expect.poll(() => page.evaluate('transitionMessages.length')).toBe(1)
        await page.evaluate(`channel.post('reveal',null)`)
        await expect.poll(() => frame.getByRole('button', { name: 'Late two' }).count()).toBe(1)
        await frame.getByRole('button', { name: 'Late two' }).click()
        await expect.poll(() => page.evaluate(`messages.filter(message=>message.type==='late').length`)).toBe(1)
        expect(await page.evaluate(`messages.find(message=>message.type==='late').target.variantId`)).toBe('two:beta')
        expect(await page.evaluate(`channel.post('host',()=>{}).then(()=>null,error=>error.code)`)).toBe('INVALID_ARGUMENT')
        expect(await page.evaluate(`channel.post('host','x'.repeat(65536)).then(()=>null,error=>error.code)`)).toBe('RESULT_TOO_LARGE')
        const codes = await frame.evaluate('channelActors.one.burst()') as (string | null)[]
        expect(codes.filter(code => code === 'RATE_LIMITED').length).toBeGreaterThanOrEqual(5)
        expect(await frame.evaluate('channelActors.one.dropped()')).toBeGreaterThanOrEqual(5)
        const previous = await page.evaluate('session.getSnapshot().runtime.runtimeId')
        if (mode === 'dev') {
          // Story collection publishes a new revision and replaces owning
          // document. Nested Vue component HMR alone can retain that document.
          await writeFile(join(fixture.root, 'Book.story.vue'), story.replace('title="Channels"', 'title="Updated channels"'))
          await expect.poll(() => page.evaluate('session.getSnapshot().runtime.runtimeId'), { timeout: 30_000 }).not.toBe(previous)
          await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
          expect(await page.evaluate(`channel.post('host',null).then(()=>null,error=>error.code)`)).toBe('RUNTIME_CHANGED')
          await page.evaluate(`window.channel=session.channels.open('factory');window.messages=[];window.stop=channel.subscribe(value=>messages.push(value))`)
          await frame.evaluate(documentId => parent.postMessage({ __histoire: true, type: '__histoire:host-channel', documentId, storyId: 'channel:book', variantId: 'one', channel: { name: 'factory', type: 'actor', data: null } }, location.origin), previous)
          await frame.evaluate('channelActors.one.post()')
          await expect.poll(() => page.evaluate('messages.length')).toBe(1)
          expect(await page.evaluate('messages[0].runtimeId')).not.toBe(previous)
        }
        await page.evaluate('mount.unmount()')
        expect(await page.evaluate(`channel.post('host',null).then(()=>null,error=>error.code)`)).toBe('PREVIEW_NOT_READY')
        await page.evaluate('stop();stopTransition();session.dispose()')
        expect(await page.evaluate('session.getSnapshot().status')).toBe('disposed')
        expect(errors).toEqual([])
      }
      finally {
        await page.close()
        await fixture.close()
      }
    })
  }

  it('relays channels through iframe Explorer inner grid with document retirement', async () => {
    const fixture = await createEmbedBridgeFixture({ copiedOutput: true, channels: ['factory'], hostHtml: '<!doctype html><div id="mount" style="width:1100px;height:800px"></div>', story: story.replace('title="Channels"', 'title="Channels" :layout="{type:\'grid\'}"'), files: { 'ChannelChild.vue': child, 'ChannelLate.vue': late, 'Guide.story.md': '# Guide' } })
    const page = await fixture.browser.newPage({ viewport: { width: 1300, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      // Start with grid selection so Explorer's initial primary is that grid;
      // changing adaptive layout after selection retires preceding document handles.
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'channel:book',variantId:'one'});window.messages=[];window.channel=session.channels.open('factory');window.stop=channel.subscribe(value=>messages.push(value));window.mount=session.mount(document.querySelector('#mount'),{surface:'explorer'});await mount.ready})()`)
      const runtime = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))!
      expect(runtime().parentFrame()!.url()).toContain('surface=explorer')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status'), { timeout: 30_000 }).toBe('ready')
      await expect.poll(() => runtime().getByText('two: none', { exact: true }).count()).toBe(1)
      await runtime().evaluate('Promise.all([channelActors.one.post(),channelActors.two.post()])')
      await expect.poll(() => page.evaluate('messages.length')).toBe(2)
      expect(await page.evaluate('messages.map(message=>message.target.variantId).sort()')).toEqual(['one', 'two:beta'])
      expect(await page.evaluate('messages.every(message=>message.runtimeId===session.getSnapshot().runtime.runtimeId)')).toBe(true)
      await page.evaluate(`channel.post('host',{value:'explorer-first'})`)
      await expect.poll(() => runtime().getByText('one: explorer-first', { exact: true }).count()).toBe(1)
      expect(await runtime().getByText('two: none', { exact: true }).count()).toBe(1)
      await page.evaluate(`(async()=>{const guide=(await session.catalog.list()).find(story=>story.docsOnly);await session.selection.select({storyId:guide.id})})()`)
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('__sandbox.html')).length).toBe(0)
      expect(await page.evaluate(`channel.post('host',null).then(()=>null,error=>error.code)`)).toBe('PREVIEW_NOT_READY')
      await page.evaluate(`session.selection.select({storyId:'channel:book',variantId:'one'})`)
      expect(await page.evaluate(`channel.post('host',null).then(()=>null,error=>error.code)`)).toBe('RUNTIME_CHANGED')
      await page.evaluate('stop();mount.unmount();session.dispose()')
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Explorer channel snapshot:', await page.evaluate('session.getSnapshot().runtime').catch(() => 'unavailable'))
      console.error('Explorer channel frames:', await Promise.all(page.frames().map(async frame => ({ url: frame.url(), text: await frame.locator('body').textContent({ timeout: 1000 }).catch(() => 'unavailable') }))))
      console.error('Explorer channel errors:', errors)
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

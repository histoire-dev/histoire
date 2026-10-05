import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createEmbedHosts } from '../../utils/embed/hosts.js'
import { attemptEmbedPrimary } from '../../utils/embed/primary-session.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'
import { closeMcpFixtures } from '../../utils/mcp/process.js'

const svelteStory = `<script context="module">
import {useHostChannel} from 'histoire/client';const dormant=useHostChannel('factory');
dormant.on('host',()=>{window.dormantMessages=(window.dormantMessages||0)+1});
</script><script>import Actor from './ChannelActor.svelte';export let Hst</script>
<Hst.Story id="svelte-channels" layout={{type:'grid',width:250}}>
<Hst.Variant id="one"><Actor label="one"/></Hst.Variant>
<Hst.Variant id="two"><Actor label="two"/></Hst.Variant></Hst.Story>`

const svelteActor = `<script>
import {onDestroy} from 'svelte';import {useHostChannel} from 'histoire/client';import Late from './ChannelLate.svelte';
export let label;const channel=useHostChannel('factory');let show=false;let received='none';
const off=channel.on('host',data=>received=data.value);const reveal=channel.on('reveal',()=>show=true);
onDestroy(()=>{off();reveal()});
if(typeof window!=='undefined'){window.channelActors??={};window.channelActors[label]={async postLater(wait){await wait;return channel.post('actor',{label})}}}
</script><p>{label}:{received}</p>{#if show}<Late {label}/>{/if}`

const svelteLate = `<script>
import {useHostChannel} from 'histoire/client';export let label;const channel=useHostChannel('factory');
function send(){void channel.post('late',{label})}
</script><button on:click={send}>Late {label}</button>`

const vanillaStory = `import {useHostChannel} from 'histoire/client';
const dormant=useHostChannel('factory');dormant.on('host',()=>{window.dormantMessages=(window.dormantMessages||0)+1});
function variant(id){return{id,title:id,async onMount({el,onUnmount}){
  const channel=useHostChannel('factory');await Promise.resolve();let received='none';
  const text=document.createElement('p');const update=()=>text.textContent=id+':'+received;
  const off=channel.on('host',data=>{received=data.value;update()});onUnmount(off);el.append(text);update();
  window.channelActors??={};window.channelActors[id]={async postLater(wait){await wait;return channel.post('actor',{label:id})}}
}}}
export default{id:'vanilla-channels',title:'Vanilla channels',layout:{type:'grid',width:250},variants:[variant('one'),variant('two')]}`

const nuxtStory = `<script>
import {useHostChannel} from 'histoire/client';const dormant=useHostChannel('factory');
dormant.on('host',()=>{window.dormantMessages=(window.dormantMessages||0)+1});
</script><script setup>import Actor from './ChannelActor.vue'</script>
<template><Story id="nuxt-channels" :layout="{type:'grid',width:250}">
<Variant id="one"><Actor label="one"/></Variant><Variant id="two"><Actor label="two"/></Variant></Story></template>`

const nuxtActor = `<script setup>
import{ref,onUnmounted}from'vue';import{useHostChannel}from'histoire/client';import Late from './ChannelLate.vue';
const props=defineProps(['label']);const channel=useHostChannel('factory');const show=ref(false);const received=ref('none');
const off=channel.on('host',data=>received.value=data.value);const reveal=channel.on('reveal',()=>show.value=true);
onUnmounted(()=>{off();reveal()});
if(typeof window!=='undefined'){window.channelActors??={};window.channelActors[props.label]={async postLater(wait){await wait;return channel.post('actor',{label:props.label})}}}
</script><template><p>{{props.label}}:{{received}}</p><Late v-if="show" :label="props.label"/></template>`

const nuxtLate = `<script setup>
import{useHostChannel}from'histoire/client';const props=defineProps(['label']);const channel=useHostChannel('factory');
function send(){void channel.post('late',{label:props.label})}
</script><template><button @click="send">Late {{props.label}}</button></template>`

/** Same public operations verify actor capture; source/runtime fixtures remain existing helpers. */
async function exerciseChannels(page: any, bookUrl: string, storyId: string, lateChild: boolean) {
  const errors: string[] = []
  page.on('pageerror', (error: Error) => errors.push(error.message))
  await page.evaluate(`(async()=>{const{createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(bookUrl)}});await session.connect();await session.catalog.getStory(${JSON.stringify(storyId)});window.messages=[];window.channel=session.channels.open('factory');window.stop=channel.subscribe(message=>messages.push(message))})()`)
  expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
  expect(await attemptEmbedPrimary(page, bookUrl, { storyId, variantId: 'one' }, 'grid', { reuseSession: true })).toBeNull()
  const frame = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
  await expect.poll(() => frame.getByText('one:none', { exact: true }).count()).toBe(1)
  await expect.poll(() => frame.getByText('two:none', { exact: true }).count()).toBe(1)
  const documentId = await page.evaluate('session.getSnapshot().runtime.runtimeId')

  // Handles capture during each initialization. Both callbacks resume after
  // host changes selected variant, without relying on ambient async ownership.
  await frame.evaluate(`window.releaseActors={};window.pendingActors=Promise.all(['one','two'].map(id=>channelActors[id].postLater(new Promise(resolve=>releaseActors[id]=resolve))));undefined`)
  await page.evaluate(`session.selection.select({storyId:${JSON.stringify(storyId)},variantId:'two'})`)
  await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
  await frame.evaluate('(async()=>{releaseActors.one();releaseActors.two();await pendingActors})()')
  await expect.poll(() => page.evaluate('messages.length')).toBe(2)
  expect(await page.evaluate('messages.map(message=>message.target.variantId).sort()')).toEqual(['one', 'two'])
  expect(await page.evaluate(`messages.every(message=>message.runtimeId===${JSON.stringify(documentId)}&&message.target.storyId===${JSON.stringify(storyId)}&&message.data.label===message.target.variantId)`)).toBe(true)

  await page.evaluate(`channel.post('host',{value:'selected-two'})`)
  await expect.poll(() => frame.getByText('two:selected-two', { exact: true }).count()).toBe(1)
  expect(await frame.getByText('one:none', { exact: true }).count()).toBe(1)
  expect(await frame.evaluate('window.dormantMessages')).toBeUndefined()
  if (lateChild) {
    await page.evaluate(`channel.post('reveal',null)`)
    await frame.getByRole('button', { name: 'Late two', exact: true }).click()
    await expect.poll(() => page.evaluate(`messages.filter(message=>message.type==='late').length`)).toBe(1)
    expect(await page.evaluate(`messages.find(message=>message.type==='late').target`)).toEqual({ storyId, variantId: 'two' })
    expect(await frame.getByRole('button', { name: 'Late one', exact: true }).count()).toBe(0)
  }
  expect(await page.evaluate('session.getSnapshot().runtime.runtimeId')).toBe(documentId)
  await page.evaluate('primary.unmount()')
  expect(await page.evaluate(`channel.post('host',null).then(()=>null,error=>error.code)`)).toBe('PREVIEW_NOT_READY')
  await page.evaluate('stop();session.dispose()')
  expect(await page.locator('iframe').count()).toBe(0)
  expect(errors).toEqual([])
}

describe('framework-owned story channels', () => {
  it.each(['svelte4', 'svelte5'] as const)('retains %s actors after await and resolves later conditional descendants', async (name) => {
    const cleanup: (() => Promise<unknown>)[] = []
    try {
      const fixture = await createMcpFrameworkProject(name)
      cleanup.push(fixture.close)
      const hosts = await createEmbedHosts()
      cleanup.push(hosts.close)
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import{HstSvelte}from'@histoire/plugin-svelte';export default{plugins:[HstSvelte()],storyMatch:['Conformance.story.svelte'],collectMaxThreads:1,mcp:false,embed:{enabled:true,channels:['factory'],allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
      for (const [file, source] of Object.entries({ 'Conformance.story.svelte': svelteStory, 'ChannelActor.svelte': svelteActor, 'ChannelLate.svelte': svelteLate })) {
        await writeFile(join(fixture.root, file), source)
      }
      const project = await createHistoireProject({ root: fixture.root })
      cleanup.push(() => project.close())
      await project.build()
      const preview = await project.preview({ host: '127.0.0.1', port: 0 })
      await preview.ready
      const browser = await launchEmbedBrowser()
      cleanup.push(() => browser.close())
      const page = await browser.newPage()
      cleanup.push(() => page.close())
      await page.goto(`${hosts.hostOrigin}/host.html`)
      await exerciseChannels(page, preview.url, 'svelte-channels', true)
    }
    finally { await closeMcpFixtures(cleanup) }
  })

  it('captures vanilla mount actor before await and preserves callback origin after selection', async () => {
    const fixture = await createEmbedBridgeFixture({ copiedOutput: true, channels: ['factory'], config: 'storyMatch:[\'*.story.js\'],', files: { 'Channel.story.js': vanillaStory } })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await exerciseChannels(page, fixture.bookUrl, 'vanilla-channels', false)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('retains actual Nuxt4 variant actors and resolves later nested Vue components', async () => {
    const cleanup: (() => Promise<unknown>)[] = []
    try {
      const fixture = await createMcpFrameworkProject('nuxt4')
      cleanup.push(fixture.close)
      const hosts = await createEmbedHosts()
      cleanup.push(hosts.close)
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import{HstVue}from'@histoire/plugin-vue';import{HstNuxt}from'@histoire/plugin-nuxt';export default{plugins:[HstVue(),HstNuxt()],storyMatch:['app/components/Conformance.story.vue'],collectMaxThreads:1,mcp:false,embed:{enabled:true,channels:['factory'],allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
      for (const [file, source] of Object.entries({ 'Conformance.story.vue': nuxtStory, 'ChannelActor.vue': nuxtActor, 'ChannelLate.vue': nuxtLate })) {
        await writeFile(join(fixture.root, 'app/components', file), source)
      }
      const project = await createHistoireProject({ root: fixture.root })
      cleanup.push(() => project.close())
      await project.build()
      const preview = await project.preview({ host: '127.0.0.1', port: 0 })
      await preview.ready
      const browser = await launchEmbedBrowser()
      cleanup.push(() => browser.close())
      const page = await browser.newPage()
      cleanup.push(() => page.close())
      await page.goto(`${hosts.hostOrigin}/host.html`)
      await exerciseChannels(page, preview.url, 'nuxt-channels', true)
    }
    finally { await closeMcpFixtures(cleanup) }
  })
})

import type { HistoireProjectTestCollectionResult, HistoireSourceDescriptor } from '@histoire/protocol'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'

/** Serve actual Tests panel independently of unrelated workbench shell components. */
export async function createTestDiscoveryPane(root: string, descriptor: HistoireSourceDescriptor, collection: HistoireProjectTestCollectionResult) {
  const directory = resolve(root, 'test-pane')
  await mkdir(directory)
  await writeFile(resolve(directory, 'facts.json'), JSON.stringify({ descriptor, collection }))
  await writeFile(resolve(directory, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>')
  await writeFile(resolve(directory, 'main.js'), `
import {createApp,defineComponent,h} from 'vue'
import {createHistoireSessionWithAdapters} from '@histoire/sdk/internal'
import {HistoireProvider} from '@histoire/vue'
import TestsPanel from '/@fs/${MCP_REPOSITORY_ROOT}/packages/histoire-app/src/app/components/panes/tests/TestsPanel.vue'
import {createWorkbenchTestsModel,provideWorkbenchTestsModel} from '/@fs/${MCP_REPOSITORY_ROOT}/packages/histoire-app/src/app/components/panes/tests/model.ts'
const facts=await (await fetch('/facts.json')).json()
const session=createHistoireSessionWithAdapters({url:location.href},{
  connect:async()=>({id:'pane',descriptor:facts.descriptor,subscribe:()=>()=>{},close:async()=>{}}),
  mount:()=>{throw new Error('Unexpected preview mount')}
})
await session.connect()
let discoveries=0
const model=createWorkbenchTestsModel(session,undefined,{
  collectProject:async()=>{discoveries++;return facts.collection}
})
const Pane=defineComponent({setup(){provideWorkbenchTestsModel(model);return()=>h(TestsPanel)}})
createApp({render:()=>h(HistoireProvider,{session,style:'width:320px;height:800px'},()=>h(Pane))}).mount('#app')
window.paneFacts=()=>({discoveries,selection:session.getSnapshot().selection,results:[...model.entries.value.values()].map(entry=>entry.summary)})
window.closePane=async()=>{model.close();await session.dispose()}
`)
  const require = createRequire(resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-app/package.json'))
  const { default: vue } = await import(require.resolve('@vitejs/plugin-vue'))
  const server = await createServer({
    configFile: false,
    root: directory,
    plugins: [vue()],
    define: { __HISTOIRE_DEV__: 'true' },
    css: { postcss: { plugins: [] } },
    resolve: { dedupe: ['vue'], alias: {
      'vue': require.resolve('vue/dist/vue.esm-bundler.js'),
      '@histoire/vue/internal': resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-vue/src/internal.ts'),
      '@histoire/vue': resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-vue/src/index.ts'),
      '@histoire/sdk/internal': resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-sdk/src/internal.ts'),
      '@histoire/controls/vue': resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-controls/src/index.ts'),
      '@iconify/vue': '@histoire/vendors/iconify',
    } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, MCP_REPOSITORY_ROOT] } },
  })
  try {
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('Test pane listener unavailable')
    return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() }
  }
  catch (error) {
    await server.close()
    throw error
  }
}

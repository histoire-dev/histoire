import { expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const child = `<script setup>
const graph = { get value() {
  window.graphReads = (window.graphReads ?? 0) + 1
  return 1
} }
defineExpose({ graph, name: 'Live child' })
</script>
<template><div>Child</div></template>`

const story = `<script setup>
import { markRaw, ref, useTemplateRef } from 'vue'
import Child from './Child.vue'

const childRef = useTemplateRef('child')
const text = ref('before')
const rows = ref([{ count: 1 }])
const localModel = markRaw({ get value() {
  window.graphReads = (window.graphReads ?? 0) + 1
  return 2
} })
</script>
<template>
  <Story id="state-graph" title="State graph">
    <Child ref="child" />
    <label>Story text <input v-model="text"></label>
    <output>{{ childRef?.name }}: {{ rows[0].count }}</output>
  </Story>
</template>`

it('syncs implicit Vue story state without walking component refs or marked raw bindings', async () => {
  const fixture = await createEmbedBridgeFixture({
    mode: 'source-dev',
    story,
    config: 'vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},',
    files: { 'Child.vue': child },
  })
  try {
    const page = await fixture.browser.newPage()
    await page.goto(`${fixture.hostOrigin}/host.html`)
    await page.evaluate(`(async () => {
      const { createHistoireSession } = await import('/sdk.js')
      const session = createHistoireSession({ url: ${JSON.stringify(fixture.bookUrl)} })
      window.session = session
      await session.connect()
      await session.selection.select({ storyId: 'state-graph', variantId: '_default' })
      const primary = session.mount(document.querySelector('#mount'), { surface: 'preview' })
      await primary.ready
    })()`)
    const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
    const input = sandbox.getByRole('textbox', { name: 'Story text' })
    await input.fill('after')
    await expect.poll(() => page.evaluate('(async () => (await session.state.get()).value.text)()')).toBe('after')
    await page.evaluate('session.state.patch({ rows: [{ count: 4 }] })')
    await expect.poll(() => sandbox.getByText('Live child: 4', { exact: true }).textContent()).toBe('Live child: 4')
    expect(await sandbox.evaluate('window.graphReads ?? 0')).toBe(0)
  }
  finally {
    await fixture.close()
  }
})

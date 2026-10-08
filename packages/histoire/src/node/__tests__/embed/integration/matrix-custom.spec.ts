import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'

/** Actual UI submits a pasted JSON array; tests never inject preferences in place of authoring. */
async function addAxis(page: any, name: string, values: unknown[]) {
  await page.getByRole('button', { name: 'Add axis', exact: true }).click()
  const form = page.getByRole('form', { name: 'Add matrix axis' })
  await form.getByRole('textbox', { name: 'Prop name', exact: true }).fill(name)
  await form.getByRole('textbox', { name: 'Values', exact: true }).fill(JSON.stringify(values))
  await form.getByRole('button', { name: 'Add axis', exact: true }).click()
  await expect.poll(() => form.count()).toBe(0)
}

/** Observe props inside real admitted documents, including full JSON types. */
async function renderedValues(page: any) {
  return page.locator('[data-test-id="preview-iframe-passive"]').evaluateAll((frames: HTMLIFrameElement[]) => frames.map(frame => frame.contentDocument?.querySelector('[data-custom]')?.getAttribute('data-values')).filter(Boolean).map(value => JSON.parse(value!)).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))))
}

/** Fit existing canvas to admit all four bounded Cartesian cells. */
async function fit(page: any) {
  await page.getByRole('button', { name: 'Zoom level', exact: true }).click()
  await page.getByRole('button', { name: /^Fit to canvas/ }).click()
}

const items = [{ label: 'First', count: 1 }, { label: 'Second', count: 2 }]
const lists = [[1, 2], [3, 4]]
const expected = items.flatMap(item => lists.map(list => [item, list]))
/** Declared props have no automatic domains; manual state starts absent. */
const component = `<script setup>defineProps({item:{type:Object,default:()=>({label:'Canonical'})},list:{type:Array,default:()=>[0]}})</script><template><output data-custom :data-values="JSON.stringify([item,list])">{{JSON.stringify([item,list])}}</output></template>`
const vueStory = `<script setup>import Custom from './Custom.vue'</script><template><Story id="custom" :init-state="()=>({})"><Variant id="one" v-slot="{state}"><Custom/><output data-manual>{{JSON.stringify(state.manual)}}</output></Variant></Story></template>`

describe('custom matrix browser acceptance', () => {
  it.each(['dev', 'static'] as const)('renders JSON props, persists structural filters and restores defaults in %s books', async (mode) => {
    const fixture = await createEmbedBridgeFixture({ mode, embedding: false, story: vueStory, files: { 'Custom.vue': component }, config: 'routerMode:"hash",ui:{frameBudget:8},' })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.bookUrl}#/story/custom?variantId=one&arrange=matrix`)
      await page.getByText('Matrix needs two prop axes', { exact: true }).waitFor()
      await addAxis(page, 'item', items)
      await addAxis(page, 'list', lists)
      await fit(page)
      await expect.poll(() => renderedValues(page), { timeout: 30_000 }).toEqual(expected)
      const filter = page.getByRole('group', { name: 'item values', exact: true })
      await filter.getByRole('button').first().click()
      await expect.poll(() => renderedValues(page)).toEqual(expected.filter(value => (value[0] as { label: string }).label === 'Second'))
      await page.reload()
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count(), { timeout: 30_000 }).toBe(2)
      await fit(page)
      await expect.poll(() => renderedValues(page)).toEqual(expected.filter(value => (value[0] as { label: string }).label === 'Second'))
      await page.getByRole('button', { name: 'Edit item values', exact: true }).click()
      const editor = page.getByRole('group', { name: 'item custom values', exact: true })
      await editor.getByRole('textbox').fill('only one')
      await editor.getByRole('button', { name: 'Apply', exact: true }).click()
      expect(await editor.getByRole('alert').textContent()).toBe('Enter at least two values, one per line')
      await editor.getByRole('textbox').fill(items.map(item => JSON.stringify(item)).join('\n'))
      await editor.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect.poll(() => renderedValues(page)).toEqual(expected)
      await page.getByRole('button', { name: 'Remove list axis', exact: true }).click()
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count()).toBe(0)
      await addAxis(page, 'manual', ['Manual first', { label: 'Manual second' }])
      await fit(page)
      await expect.poll(() => page.locator('[data-test-id="preview-iframe-passive"]').evaluateAll((frames: HTMLIFrameElement[]) => frames.map(frame => frame.contentDocument?.querySelector('[data-manual]')?.textContent).filter(Boolean).sort()), { timeout: 30_000 }).toEqual(['"Manual first"', '"Manual first"', '{"label":"Manual second"}', '{"label":"Manual second"}'].sort())
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it.each(['react', 'svelte4'] as const)('delivers object/array custom values to real %s story state', async (framework) => {
    const fixture = await createMcpFrameworkProject(framework)
    const browser = await launchEmbedBrowser()
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    const page = await browser.newPage()
    try {
      const svelte = framework === 'svelte4'
      const filename = svelte ? 'Custom.story.svelte' : 'Custom.story.tsx'
      // Svelte generates slot updates only for mutable variables. An actual
      // story action retains those updates, like controls with bind:value.
      const source = svelte
        ? `<script>export let Hst;let item={label:'Canonical'};let list=[0]</script><Hst.Story id="custom"><Hst.Variant id="one"><output data-custom data-values={JSON.stringify([item,list])}>{JSON.stringify([item,list])}</output><button on:click={()=>{item={label:'Changed'};list=[9]}}>Change values</button></Hst.Variant></Hst.Story>`
        : `import {Story,Variant} from '@histoire/plugin-react';export default function Custom(){return <Story id="custom" initState={()=>({item:{label:'Canonical'},list:[0]})}><Variant id="one">{({state})=><output data-custom data-values={JSON.stringify([state.item,state.list])}>{JSON.stringify([state.item,state.list])}</output>}</Variant></Story>}`
      await writeFile(join(fixture.root, filename), source)
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import {${svelte ? 'HstSvelte' : 'HstReact'}} from '@histoire/plugin-${svelte ? 'svelte' : 'react'}';export default {plugins:[${svelte ? 'HstSvelte' : 'HstReact'}()],storyMatch:['${filename}'],routerMode:'hash',ui:{frameBudget:8},collectMaxThreads:1,mcp:false}`)
      project = await createHistoireProject({ root: fixture.root })
      await project.build()
      const server = await project.preview({ host: '127.0.0.1', port: 0 })
      await server.ready
      await page.goto(`${server.url}#/story/custom?variantId=one&arrange=matrix`)
      await page.getByText('Matrix needs two prop axes', { exact: true }).waitFor()
      await addAxis(page, 'item', items)
      await addAxis(page, 'list', lists)
      await fit(page)
      expect(await page.getByRole('button', { name: /^Select matrix cell / }).count()).toBe(4)
      for (let index = 0; index < expected.length; index++) {
        await page.getByRole('button', { name: /^Select matrix cell / }).nth(index).click()
        await expect.poll(() => page.locator('.histoire-matrix-cell[data-selected="true"] iframe').evaluateAll((frames: HTMLIFrameElement[]) => {
          const text = frames[0]?.contentDocument?.querySelector('[data-custom]')?.getAttribute('data-values')
          return text ? JSON.parse(text) : null
        }), { timeout: 30_000 }).toEqual(expected[index])
      }
    }
    finally {
      await page.close()
      await browser.close()
      await project?.close()
      await fixture.close()
    }
  })
})

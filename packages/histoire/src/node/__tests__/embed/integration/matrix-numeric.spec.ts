import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'

/** Real component metadata distinguishes numeric values from accidentally stringified props. */
const component = `<script setup>defineProps({count:Number,amount:Number})</script><template><output data-numeric :data-count="count" :data-amount="amount" :data-count-type="typeof count" :data-amount-type="typeof amount">{{count}} / {{amount}}</output></template>`
/** Declaration range must pass framework collection and normalized catalog delivery. */
const story = `<script setup>import Numeric from './Numeric.vue'</script><template><Story id="numeric" :matrix="{axes:{count:{min:0,max:0.3,step:0.1}}}"><Variant id="one"><Numeric :count="7" :amount="8" /></Variant></Story></template>`

describe('numeric matrix browser acceptance', () => {
  it.each(['dev', 'static'] as const)('delivers project defaults, story ranges and saved overrides in %s books', async (mode) => {
    const fixture = await createEmbedBridgeFixture({ mode, embedding: false, story, files: { 'Numeric.vue': component }, config: `routerMode:'hash',ui:{frameBudget:12,matrix:{numericValues:[3,6]}},` })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.bookUrl}#/story/numeric?variantId=one&arrange=matrix&rows=count&cols=amount`)
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count(), { timeout: 30_000 }).toBe(8)
      await page.getByRole('button', { name: 'Zoom level', exact: true }).click()
      await page.getByRole('button', { name: /^Fit to canvas/ }).click()
      await expect.poll(() => page.locator('[data-test-id="preview-iframe-passive"]').evaluateAll((frames: HTMLIFrameElement[]) => frames.map((frame) => {
        const value = frame.contentDocument?.querySelector('[data-numeric]')
        return value && [value.getAttribute('data-count'), value.getAttribute('data-amount'), value.getAttribute('data-count-type'), value.getAttribute('data-amount-type')].join('/')
      }).sort()), { timeout: 30_000 }).toEqual(['0/3/number/number', '0/6/number/number', '0.1/3/number/number', '0.1/6/number/number', '0.2/3/number/number', '0.2/6/number/number', '0.3/3/number/number', '0.3/6/number/number'].sort())
      const editor = page.getByRole('group', { name: 'count numeric values', exact: true })
      // Numeric editor stays collapsed until the axis edit action opens it.
      const edit = page.getByRole('button', { name: 'Edit count values', exact: true })
      await edit.click()
      await editor.getByRole('button', { name: 'Range', exact: true }).click()
      await editor.getByRole('textbox', { name: 'count min', exact: true }).fill('-1')
      await editor.getByRole('textbox', { name: 'count max', exact: true }).fill('0')
      await editor.getByRole('textbox', { name: 'count step', exact: true }).fill('0.5')
      await editor.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count()).toBe(6)
      await page.reload()
      await edit.click()
      await expect.poll(() => page.getByRole('textbox', { name: 'count values', exact: true }).inputValue()).toBe('-1, -0.5, 0')
      await editor.getByRole('button', { name: 'Reset values', exact: true }).click()
      // Reset closes the editor; reopen it to check restored source defaults.
      await edit.click()
      await expect.poll(() => page.getByRole('textbox', { name: 'count values', exact: true }).inputValue()).toBe('0, 0.1, 0.2, 0.3')
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count()).toBe(8)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it.each(['svelte4', 'react'] as const)('collects numeric declarations from a built %s book', async (framework) => {
    const fixture = await createMcpFrameworkProject(framework)
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    try {
      const svelte = framework === 'svelte4'
      const filename = svelte ? 'Numeric.story.svelte' : 'Numeric.story.tsx'
      const source = svelte
        ? `<script>export let Hst</script><Hst.Story id="numeric" matrix={{axes:{count:{min:0,max:0.3,step:0.1}}}}><Hst.Variant id="one"><p>Numeric</p></Hst.Variant></Hst.Story>`
        : `import {Story,Variant} from '@histoire/plugin-react';export default function Numeric(){return <Story id="numeric" matrix={{axes:{count:{min:0,max:0.3,step:0.1}}}}><Variant id="one"><p>Numeric</p></Variant></Story>}`
      await writeFile(join(fixture.root, filename), source)
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import {${svelte ? 'HstSvelte' : 'HstReact'}} from '@histoire/plugin-${svelte ? 'svelte' : 'react'}';export default {plugins:[${svelte ? 'HstSvelte' : 'HstReact'}()],storyMatch:['${filename}'],collectMaxThreads:1,mcp:false}`)
      project = await createHistoireProject({ root: fixture.root })
      await project.build()
      const server = await project.preview({ host: '127.0.0.1', port: 0 })
      await server.ready
      expect(project.getSnapshot().preview?.catalog?.stories.find(story => story.id === 'numeric')?.matrix?.axes.count).toEqual([0, 0.1, 0.2, 0.3])
    }
    finally {
      await project?.close()
      await fixture.close()
    }
  })
})

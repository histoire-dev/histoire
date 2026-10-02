import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createMcpCliProject } from './cli-project.js'

/** Real Vue tests shared by project-Vitest and copied Node-artifact parity probes. */
export async function createMcpBrowserTestProject() {
  const project = await createMcpCliProject()
  await writeFile(resolve(project.root, 'package.json'), JSON.stringify({ type: 'module', devDependencies: { 'vitest': '4.1.10', '@vitest/browser-playwright': '4.1.10', 'playwright': '1.59.1' } }))
  await writeFile(resolve(project.root, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false, test: { collectTimeout: 60000, runTimeout: 60000 } };
`)
  await writeFile(resolve(project.root, 'Book.story.vue'), `<script lang="ts">
import { onTest } from 'histoire/client'
import { beforeEach, expect, it } from 'vitest'
onTest(({ canvas }) => {
  beforeEach(() => { expect(canvas.isConnected).toBe(true) })
  it('outcome', () => {
    expect(canvas.querySelector('button')?.getAttribute('data-case')).not.toBe('fail')
  })
  it('explicit body timeout', async () => {
    const kind = canvas.querySelector('button')?.getAttribute('data-case')
    if (kind === 'timeout') await new Promise(done => setTimeout(done, 80))
  }, 30)
  it('cancellable body', async () => {
    if (canvas.querySelector('button')?.getAttribute('data-case') === 'slow') await new Promise(() => {})
  }, 20000)
  it.skip('skipped case', () => { throw new Error('never run') })
})
</script>
<template><Story id="test-book" title="Test book">
<Variant id="normal"><button data-case="normal">Normal</button></Variant>
<Variant id="fail"><button data-case="fail">Fail</button></Variant>
<Variant id="timeout"><button data-case="timeout">Timeout</button></Variant>
<Variant id="slow"><button data-case="slow">Slow</button></Variant>
</Story></template>`)
  await writeFile(resolve(project.root, 'Empty.story.vue'), '<template><Story id="empty"><Variant id="normal"><span>No tests</span></Variant></Story></template>')
  return project
}

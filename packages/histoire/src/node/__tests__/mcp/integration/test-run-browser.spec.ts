import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it } from 'vitest'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'

it('prebundles an async CommonJS dependency before the browser runs story assertions', async () => {
  const fixture = await createMcpBrowserTestProject()
  const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
  try {
    const dependency = join(fixture.root, 'node_modules', 'test-button-label')
    await mkdir(dependency)
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'test-button-label', main: 'index.cjs' }))
    await writeFile(join(dependency, 'index.cjs'), 'module.exports = "From CommonJS"')
    await writeFile(join(fixture.root, 'AsyncLabel.vue'), `<script setup>
const { default: label } = await import('test-button-label')
</script><template><button>{{ label }}</button></template>`)
    await writeFile(join(fixture.root, 'Dependency.story.vue'), `<script setup>
import AsyncLabel from './AsyncLabel.vue'
import { onTest } from 'histoire/client'
import { expect, it } from 'vitest'
onTest(({ canvas }) => {
  it('shows the dependency label', () => expect(canvas.querySelector('button')?.textContent).toBe('From CommonJS'))
})
</script><template><Story id="dependency"><Variant id="main"><AsyncLabel /></Variant></Story></template>`)

    const control = await project.runTests({ storyId: 'test-book', variantId: 'normal' })
    expect(control).toMatchObject({ passed: 3, failed: 0, skipped: 1 })
    const result = await project.runTests({ storyId: 'dependency', variantId: 'main' })
    expect(result.tests).toMatchObject([{ name: 'shows the dependency label', state: 'passed' }])
  }
  finally {
    await project.close()
    await fixture.close()
  }
})

it('uses the live discovery canvas once, then mounts each further browser case fresh', async () => {
  const fixture = await createMcpBrowserTestProject()
  const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
  try {
    await writeFile(join(fixture.root, 'MountCounter.vue'), `<script setup>
import { onMounted, ref } from 'vue'
const mount = ref(0)
onMounted(() => {
  window.storyMountCount = (window.storyMountCount ?? 0) + 1
  mount.value = window.storyMountCount
})
</script><template><button :data-mount="mount">Fresh state</button></template>`)
    await writeFile(join(fixture.root, 'Mount.story.vue'), `<script setup>
import MountCounter from './MountCounter.vue'
import { onTest } from 'histoire/client'
import { afterEach, expect, it } from 'vitest'
onTest(({ canvas, variant }) => {
  afterEach(() => expect(canvas.isConnected).toBe(true))
  it('first ' + variant.id, () => {
    const button = canvas.querySelector('button')
    expect(button.dataset.mount).toBe('1')
    button.textContent = 'Changed by first case'
  })
  it('later case is isolated', () => {
    const button = canvas.querySelector('button')
    expect(button.textContent).toBe('Fresh state')
    expect(button.dataset.mount).toBe('2')
  })
  it.skip('skipped case', () => { throw new Error('must stay skipped') })
})
</script><template><Story id="mount"><Variant id="main"><MountCounter /></Variant></Story></template>`)

    for (let run = 0; run < 2; run++) {
      const result = await project.runTests({ storyId: 'mount', variantId: 'main' })
      expect(result.tests).toMatchObject([
        { name: 'first main', state: 'passed' },
        { name: 'later case is isolated', state: 'passed' },
        { name: 'skipped case', state: 'skipped' },
      ])
    }
  }
  finally {
    await project.close()
    await fixture.close()
  }
})

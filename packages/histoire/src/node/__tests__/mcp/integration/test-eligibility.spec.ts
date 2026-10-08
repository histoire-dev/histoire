import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it, vi } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { getKnownEmptyTestStories } from '../../../../../dist/node/test/eligibility/index.js'
import { createHistoireTestCollectionTask } from '../../../../../dist/node/test/execution-service.js'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'

it('proves 1,000 empty variants without mounts; follows registrations and retires dependency/setup proofs', async () => {
  const fixture = await createMcpBrowserTestProject()
  const effects: string[] = []
  const marker = createServer((request, response) => {
    effects.push(request.url!)
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.end('ok')
  })
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'HugeGrid.story.vue'), `<script setup>import {onMounted} from 'vue';onMounted(()=>fetch('${origin}/mount'))</script><template><Story id="huge"><Variant v-for="n in 1000" :key="n" :id="String(n)"><span>{{n}}</span></Variant></Story></template>`)
    await writeFile(resolve(fixture.root, 'helper.ts'), 'export const flag = true')
    await writeFile(resolve(fixture.root, 'Dependency.story.vue'), '<script setup>import {flag} from "./helper"</script><template><Story id="dependency"><Variant id="main">{{flag}}</Variant></Story></template>')
    const registration = `import {onTest} from 'histoire/client';import {it} from 'vitest';onTest(()=>{it('reachable',()=>fetch('${origin}/body'))});export const flag=true`
    await writeFile(resolve(fixture.root, 'register.ts'), registration)
    await writeFile(resolve(fixture.root, 'reexport.ts'), 'export * from "./register"')
    await writeFile(resolve(fixture.root, 'Child.vue'), `<script setup>${registration.replace(';export const flag=true', '')}</script><template><span>Child</span></template>`)
    const scripts = {
      setup: `import {onTest} from 'histoire/client';import {it} from 'vitest';onTest(()=>it('setup',()=>{}))`,
      child: 'import Child from "./Child.vue"',
      reexport: 'import {flag} from "./reexport"',
      literal: 'await import("./register")',
      opaque: 'const moduleName="./register.ts";await import(/* @vite-ignore */ moduleName)',
    }
    for (const [id, script] of Object.entries(scripts)) {
      const body = id === 'child' ? '<Child/>' : id === 'reexport' ? '{{flag}}' : '<span>Story</span>'
      const scriptTag = id === 'literal' || id === 'opaque' ? 'script lang="ts"' : 'script setup'
      await writeFile(resolve(fixture.root, `${id}.story.vue`), `<${scriptTag}>${script}</script><template><Story id="${id}"><Variant id="main">${body}</Variant></Story></template>`)
    }
    await writeFile(resolve(fixture.root, 'cycle-a.ts'), 'import "./cycle-b";export const flag=true')
    await writeFile(resolve(fixture.root, 'cycle-b.ts'), 'import "./cycle-a"')
    await writeFile(resolve(fixture.root, 'Cycle.story.vue'), '<script setup>import {flag} from "./cycle-a"</script><template><Story id="cycle"><Variant id="main">{{flag}}</Variant></Story></template>')
    project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const services = getProjectServices(project)
    const context = () => services.dev!.controller.current!.context
    const proof = await getKnownEmptyTestStories(context())
    expect(proof).toEqual(expect.arrayContaining(['huge', 'empty', 'dependency', 'cycle']))
    for (const id of ['test-book', ...Object.keys(scripts)]) expect(proof).not.toContain(id)
    effects.length = 0
    const started = performance.now()
    const result = await services.execution.enqueue(createHistoireTestCollectionTask(context(), { storyId: 'huge' })).result
    expect(performance.now() - started).toBeLessThan(5000)
    expect(result.variants.map(entry => entry.target)).toEqual(Array.from({ length: 1000 }, (_, n) => ({ storyId: 'huge', variantId: String(n + 1) })))
    expect(result.variants.every(entry => entry.collection.definitions.length === 0 && !entry.collection.error)).toBe(true)
    expect(effects).toEqual([])
    const mounted = await services.execution.enqueue(createHistoireTestCollectionTask(context(), {})).result
    for (const id of Object.keys(scripts)) {
      const entry = mounted.variants.find(entry => entry.target.storyId === id)!
      expect(entry.collection.error, id).toBeUndefined()
      expect(entry.collection.definitions, id).toHaveLength(1)
    }
    expect(effects).not.toContain('/body')
    await writeFile(resolve(fixture.root, 'helper.ts'), registration)
    await vi.waitFor(async () => expect(await getKnownEmptyTestStories(context(), 'dependency')).not.toContain('dependency'))
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false))
    const changed = await services.execution.enqueue(createHistoireTestCollectionTask(context(), { storyId: 'dependency' })).result
    expect(changed.variants[0].collection.definitions).toHaveLength(1)
    await writeFile(resolve(fixture.root, 'helper.ts'), 'export const flag=true')
    await vi.waitFor(async () => expect(await getKnownEmptyTestStories(context(), 'dependency')).toContain('dependency'))
    await writeFile(resolve(fixture.root, 'setup.ts'), registration)
    await writeFile(resolve(fixture.root, 'custom config.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['*.story.vue'],mcp:false,setupFile:'setup.ts'}`)
    await vi.waitFor(async () => expect(await getKnownEmptyTestStories(context(), 'huge')).not.toContain('huge'), { timeout: 10_000 })
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false), { timeout: 10_000 })
    const global = await services.execution.enqueue(createHistoireTestCollectionTask(context(), { storyId: 'empty' })).result
    expect(global.variants[0].collection.definitions).toHaveLength(1)
    await writeFile(resolve(fixture.root, 'setup.ts'), 'export const flag=true')
    await vi.waitFor(async () => expect(await getKnownEmptyTestStories(context(), 'huge')).toContain('huge'))
  }
  finally {
    await project?.close()
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 120_000)

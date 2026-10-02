import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { linkMcpFixtureDependencies, linkMcpFixturePlaywright, MCP_REPOSITORY_ROOT } from './cli-project.js'
import { startMcpProcess } from './process.js'

/** Copy unchanged example sources, reusing explicitly installed example dependencies. */
export async function createMcpFrameworkProject(name: 'svelte4' | 'svelte5' | 'sveltekit' | 'nuxt4') {
  const example = resolve(MCP_REPOSITORY_ROOT, 'examples', name === 'svelte5' ? 'sveltekit' : name)
  const root = await mkdtemp(resolve(tmpdir(), `histoire MCP ${name} `))
  await cp(example, root, {
    recursive: true,
    filter: path => !['node_modules', '.histoire', '.nuxt', '.output', '.svelte-kit'].includes(basename(path)),
  })
  await linkMcpFixtureDependencies(root, name === 'svelte5' ? 'sveltekit' : name)
  await linkMcpFixturePlaywright(root)
  if (name === 'svelte5') {
    await writeFile(resolve(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', allowJs: true } }))
    await writeFile(resolve(root, 'vite.config.ts'), `import { HstSvelte } from '@histoire/plugin-svelte'; import { svelte } from '@sveltejs/vite-plugin-svelte'; export default { base:'/book/', plugins:[svelte()], histoire:{plugins:[HstSvelte()],storyMatch:['Conformance.story.svelte']} };`)
    await writeFile(resolve(root, 'Conformance.story.svelte'), '<script>export let Hst</script><Hst.Story id="svelte5-book"><Hst.Variant id="normal"><button>Svelte 5 conformance</button></Hst.Variant></Hst.Story>')
  }
  if (name === 'sveltekit') {
    const require = createRequire(resolve(root, 'package.json'))
    const entry = resolve(require.resolve('@sveltejs/kit/package.json'), '../svelte-kit.js')
    const sync = startMcpProcess(['sync'], root, {}, entry)
    if ((await sync.waitForExit()).code !== 0) throw new Error(`SvelteKit sync failed: ${sync.output()}`)
  }
  else if (name !== 'nuxt4') {
    const path = resolve(root, 'vite.config.ts')
    await writeFile(path, (await readFile(path, 'utf8')).replace('defineConfig({', 'defineConfig({ base: \'/book/\','))
  }
  return {
    root,
    /** Remove copied sources only after owned runtime closes. */
    async close() { await rm(root, { recursive: true, force: true }) },
  }
}

import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createMcpBrowserTestProject } from './browser-test-project.js'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'
import { createVue3DiscoveryProject } from './vue3-discovery-project.js'

/** Private built packages allow destructive rebuild probes without touching concurrent work. */
export async function createDevLauncherProject(createProject: () => Promise<{ root: string, close: () => Promise<void> }> = createMcpBrowserTestProject, storyMatch = ['*.story.vue']) {
  const project = await createProject()
  const repository = await mkdtemp(resolve(tmpdir(), 'histoire launcher repository '))
  try {
    const packages = new Map<string, string>()
    const entries = await readdir(resolve(MCP_REPOSITORY_ROOT, 'packages'))
    for (const entry of entries) {
      const source = resolve(MCP_REPOSITORY_ROOT, 'packages', entry)
      const destination = resolve(repository, 'packages', entry)
      const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
      packages.set(manifest.name, destination)
      await mkdir(destination, { recursive: true })
      // Copy sources too: source UI assets must stay inside private Vite filesystem roots.
      for (const file of await readdir(source, { withFileTypes: true })) {
        if (file.isFile() || file.name === 'dist' || file.name === 'src') await cp(resolve(source, file.name), resolve(destination, file.name), { recursive: true })
      }
    }
    // Unbundled source UI dependency imports Vue through Histoire's vendor aliases.
    // Keep its importer private too, so aliases resolve one renderer rather than shared workspace Vue.
    const scroller = await realpath(resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-vue/node_modules/vue-virtual-scroller'))
    const privateScroller = resolve(repository, 'external/vue-virtual-scroller')
    await cp(scroller, privateScroller, { recursive: true })
    packages.set('vue-virtual-scroller', privateScroller)
    await linkPrivateDependencies(resolve(MCP_REPOSITORY_ROOT, 'packages/histoire-vue'), privateScroller, packages)
    for (const entry of entries) await linkPrivateDependencies(resolve(MCP_REPOSITORY_ROOT, 'packages', entry), resolve(repository, 'packages', entry), packages)
    await linkPrivateDependencies(MCP_REPOSITORY_ROOT, repository, packages)
    await cp(resolve(MCP_REPOSITORY_ROOT, 'tailwind.config.cjs'), resolve(repository, 'tailwind.config.cjs'))
    // Replace only fixture links: stories and config must resolve the private Histoire install too.
    const dependencies = resolve(repository, 'fixture-dependencies')
    await mkdir(dependencies)
    await rename(resolve(project.root, 'node_modules'), resolve(dependencies, 'node_modules'))
    await linkPrivateDependencies(dependencies, project.root, packages)
    await rm(dependencies, { recursive: true })
    const vendors = JSON.parse(await readFile(resolve(repository, 'packages/histoire-vendors/package.json'), 'utf8'))
    const aliases = Object.entries(vendors.exports).filter(([name]) => !name.includes('*')).map(([name, target]) => ({
      find: `@histoire/vendors/${name.slice(2)}`,
      replacement: resolve(repository, 'packages/histoire-vendors', target as string),
    }))
    await writeFile(resolve(project.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { plugins: [vue()], resolve: { alias: ${JSON.stringify(aliases)} }, server: { open: false } }`)
    const scripts = resolve(repository, 'scripts')
    await mkdir(scripts)
    const launcher = resolve(scripts, 'dev-histoire.mjs')
    await cp(resolve(MCP_REPOSITORY_ROOT, 'scripts/dev-histoire.mjs'), launcher)
    await writeFile(resolve(project.root, 'custom config.ts'), `
import { writeFileSync } from 'node:fs'
import { HstVue } from '@histoire/plugin-vue'
export default { plugins: [HstVue(), { name: 'launcher-observer', onDev() {
  writeFileSync(${JSON.stringify(resolve(project.root, 'launcher-state.json'))}, JSON.stringify({ pid: process.pid, source: process.env.HISTOIRE_DEV === 'true' }))
} }], vite: { plugins: [{ name: 'launcher-document-observer', transformIndexHtml() {
  return [{ tag: 'meta', attrs: { name: 'launcher-pid', content: String(process.pid) }, injectTo: 'head' }, { tag: 'meta', attrs: { name: 'launcher-build', content: process.env.HISTOIRE_LAUNCHER_BUILD || 'initial' }, injectTo: 'head' }]
} }] }, storyMatch: ${JSON.stringify(storyMatch)}, mcp: false, test: { collectTimeout: 60000, runTimeout: 60000 } }
`)
    return { ...project, repository, launcher,
      /** Release private snapshots after every owned process has exited. */
      async close() {
        await project.close()
        await rm(repository, { recursive: true, force: true })
      } }
  }
  catch (error) {
    await project.close()
    await rm(repository, { recursive: true, force: true })
    throw error
  }
}

/** External installs are read-only links; workspace imports always resolve private snapshots. */
async function linkPrivateDependencies(source: string, destination: string, packages: Map<string, string>) {
  const directory = resolve(source, 'node_modules')
  let entries: string[]
  try {
    entries = await readdir(directory)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of entries.filter(name => !name.startsWith('.'))) {
    const names = name.startsWith('@') ? (await readdir(resolve(directory, name))).map(child => `${name}/${child}`) : [name]
    for (const dependency of names) {
      const target = resolve(destination, 'node_modules', dependency)
      await mkdir(resolve(target, '..'), { recursive: true })
      await symlink(packages.get(dependency) ?? await realpath(resolve(directory, dependency)), target, 'dir')
    }
  }
}

/** Exercise original Vue lifecycle definitions without unrelated example Tailwind entry compilation. */
export async function createDevLauncherVueProject() {
  return createDevLauncherProject(async () => {
    const example = await createVue3DiscoveryProject()
    // Lifecycle story has no Tailwind entry; copied CSS pipeline is outside this execution probe.
    await rm(resolve(example.root, 'postcss.config.cjs'))
    await rm(resolve(example.root, 'node_modules/postcss-import'))
    return example
  }, ['src/components/VitestLifecycle.story.vue'])
}

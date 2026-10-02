import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createMcpBrowserTestProject } from './browser-test-project.js'
import { linkMcpFixturePlaywright, MCP_REPOSITORY_ROOT } from './cli-project.js'
import { startMcpProcess } from './process.js'

/** Build real Vue fixture, copy artifact, then remove project and its dependencies. */
export async function createMcpArtifactProject(includeSource = true, routerMode = 'history', bodyMarker?: string) {
  const project = await createMcpBrowserTestProject()
  let portable: Awaited<ReturnType<typeof copyMcpArtifact>> | undefined
  try {
    await writeFile(resolve(project.root, 'custom config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()], storyMatch:['*.story.vue'], routerMode:${JSON.stringify(routerMode)}, mcp:true, build:{node:{includeSource:${includeSource}}}, test:{collectTimeout:60000,runTimeout:60000} };`)
    await writeFile(resolve(project.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { base:'/book/',plugins:[vue()] };`)
    if (bodyMarker) await addMcpTestBodyMarker(project.root, bodyMarker)
    const previewFixture = resolve(MCP_REPOSITORY_ROOT, 'packages/histoire/src/node/__tests__/fixtures/mcp-preview/vue')
    await cp(resolve(previewFixture, 'Preview.story.vue'), resolve(project.root, 'Preview.story.vue'))
    await cp(resolve(previewFixture, 'greeting.ts'), resolve(project.root, 'greeting.ts'))
    await writeFile(resolve(project.root, 'Preview.story.md'), '# Portable original docs\r\n😀\r\n')
    const staticBuild = startMcpProcess(['build', '-c', 'custom config.ts'], project.root)
    const staticResult = await staticBuild.waitForExit()
    if (staticResult.code !== 0) throw new Error(`Static build failed: ${staticBuild.output()}`)
    const staticHtml = await readFile(resolve(project.root, '.histoire/dist/index.html'), 'utf8')
    const nodeBuild = startMcpProcess(['build', '-c', 'custom config.ts', '--target', 'node'], project.root)
    const nodeResult = await nodeBuild.waitForExit()
    if (nodeResult.code !== 0) throw new Error(`Node build failed: ${nodeBuild.output()}`)
    portable = await copyMcpArtifact(project.root)
    await project.close()
    return { ...portable, staticHtml }
  }
  catch (error) {
    await project.close()
    await portable?.close()
    throw error
  }
}

/** Copy built artifact outside project; expose only explicit optional browser peer. */
export async function copyMcpArtifact(projectRoot: string) {
  const root = await mkdtemp(resolve(tmpdir(), 'histoire portable MCP '))
  const artifact = resolve(root, 'artifact')
  const unrelated = resolve(root, 'unrelated cwd')
  try {
    await cp(resolve(projectRoot, '.histoire/dist'), artifact, { recursive: true })
    await mkdir(unrelated)
    return {
      root,
      artifact,
      unrelated,
      /** Explicit optional runtime; never original project dependencies. */
      async addPlaywright() {
        await linkMcpFixturePlaywright(artifact)
      },
      /** Remove owned copy after process drain. */
      async close() { await rm(root, { recursive: true, force: true }) },
    }
  }
  catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

/** Exact slow test reports body entry to owned HTTP barrier before hanging. */
export async function addMcpTestBodyMarker(root: string, endpoint: string) {
  const path = resolve(root, 'Book.story.vue')
  const source = await readFile(path, 'utf8')
  await writeFile(path, source.replace('if (canvas.querySelector(\'button\')?.getAttribute(\'data-case\') === \'slow\') await new Promise(() => {})', `if (canvas.querySelector('button')?.getAttribute('data-case') === 'slow') { await fetch(${JSON.stringify(endpoint)}); await new Promise(() => {}) }`))
}

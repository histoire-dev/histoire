import { lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository fixture dependency location; production never resolves through it. */
export const MCP_REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../../../', import.meta.url))
/** Installed-equivalent CLI used by real stdio consumer checks. */
export const MCP_BUILT_CLI = resolve(MCP_REPOSITORY_ROOT, 'packages/histoire/bin.mjs')

/** Keep optimizer/run caches owned while linking explicitly installed fixture dependencies. */
export async function linkMcpFixtureDependencies(root: string, example: string) {
  const source = resolve(MCP_REPOSITORY_ROOT, 'examples', example, 'node_modules')
  const target = resolve(root, 'node_modules')
  await mkdir(target)
  for (const name of await readdir(source)) {
    if (!name.startsWith('.')) await symlink(resolve(source, name), resolve(target, name), 'dir')
  }
}

/** Add only explicit Playwright runtime to owned fixture or copied artifact. */
export async function linkMcpFixturePlaywright(root: string) {
  const target = resolve(root, 'node_modules/playwright')
  await mkdir(resolve(root, 'node_modules'), { recursive: true })
  try {
    await lstat(target)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const require = createRequire(resolve(MCP_REPOSITORY_ROOT, 'examples/vue3/package.json'))
    await symlink(resolve(require.resolve('playwright/package.json'), '..'), target, 'dir')
  }
}

/** Minimal real Vue project with hostile logs and paths, reusable by CLI suites. */
export async function createMcpCliProject() {
  const root = await mkdtemp(resolve(tmpdir(), 'histoire mcp project '))
  const source = '<template><Story id="stdio/a %2E.." title="Stdio Book"><Variant id="main"><button>Button</button></Variant></Story></template>\r\n'
  await linkMcpFixtureDependencies(root, 'vue3')
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ type: 'module' }))
  await writeFile(resolve(root, 'Book.story.vue'), source)
  await writeFile(resolve(root, 'Book.story.md'), '# Original documentation 🚀\r\n')
  await writeFile(resolve(root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { plugins: [vue()], server: { open: false, host: '0.0.0.0' } }`)
  await writeFile(resolve(root, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
console.log('CONFIG_CONSOLE_LOG');
process.stdout.write('CONFIG_DIRECT_STDOUT\\n');
console.log('CONFIG_TOKEN=' + String(process.env.HISTOIRE_MCP_TOKEN));
process.stdout.write('L'.repeat(256 * 1024) + '\\n');
export default { plugins: [HstVue(), { name: 'mcp-noisy', onDev() { console.log('PLUGIN_CONSOLE_LOG') } }], storyMatch: ['*.story.vue'], mcp: true };
`)
  return {
    /** Existing project directory containing spaces. */
    root,
    /** Exact original source expected from source tool and resource. */
    source,
    /** Delete only this owned fixture after runtime teardown. */
    async close() { await rm(root, { recursive: true, force: true }) },
  }
}

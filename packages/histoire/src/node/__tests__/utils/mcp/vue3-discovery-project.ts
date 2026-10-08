import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { linkMcpFixtureDependencies, MCP_REPOSITORY_ROOT } from './cli-project.js'

/** Copy actual example definitions while owning every optimizer cache and generated run. */
export async function createVue3DiscoveryProject() {
  const root = await mkdtemp(resolve(tmpdir(), 'histoire-discovery-cold-'))
  const source = resolve(MCP_REPOSITORY_ROOT, 'examples/vue3')
  for (const name of ['src', 'public', 'package.json', 'vite.config.ts', 'histoire.config.ts', 'tailwind.config.cjs']) {
    await cp(resolve(source, name), resolve(root, name), { recursive: true })
  }
  await linkMcpFixtureDependencies(root, 'vue3')
  for (const name of ['postcss-import', 'tailwindcss', 'autoprefixer']) await symlink(resolve(MCP_REPOSITORY_ROOT, 'node_modules', name), resolve(root, 'node_modules', name))
  // Example's layer-only SFC CSS is valid native CSS, but Tailwind rejects it
  // as a separate Tailwind entry. Compile app CSS while retaining story bytes.
  await writeFile(resolve(root, 'postcss.config.cjs'), `
const tailwind = require('tailwindcss')(require('node:path').resolve(__dirname, 'tailwind.config.cjs'))
module.exports = { plugins: [require('postcss-import'), require('tailwindcss/nesting'), {
  postcssPlugin: 'fixture-tailwind',
  plugins: tailwind.plugins.map(plugin => (root, result) => root.source.input.file.includes('?vue&type=style') ? undefined : plugin(root, result))
}, require('autoprefixer')] }
`)
  return { root,
    /** Release only this owned fixture after its runtime stops. */
    async close() { await rm(root, { recursive: true, force: true }) } }
}

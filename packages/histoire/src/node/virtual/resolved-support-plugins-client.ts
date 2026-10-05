import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { PLUGINS_HAVE_DEV } from './util.js'

const require = createRequire(import.meta.url)

/** One document owns a single lazy module acquisition for each support runtime. */
export function resolvedSupportPluginsClient(ctx: Context) {
  const plugins = ctx.supportPlugins.map(p => `${JSON.stringify(p.id)}: () => import(${JSON.stringify(require.resolve(`${p.moduleName}/client${process.env.HISTOIRE_DEV && PLUGINS_HAVE_DEV.includes(p.moduleName) ? '-dev' : ''}`, {
    paths: [ctx.root, import.meta.url],
  }))})`)
  return `const supportLoaders = {
    ${plugins.join(',\n  ')}
  }
  // Mount/render consumers await the same evaluation; failure remains observed
  // until this document/module is replaced, without automatic execution retry.
  const supportModules = Object.create(null)
  export const clientSupportPlugins = Object.fromEntries(Object.entries(supportLoaders).map(([id, load]) => [id, () => supportModules[id] ??= load()]))`
}

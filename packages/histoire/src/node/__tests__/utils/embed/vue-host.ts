import { join } from 'node:path'
import { build } from 'esbuild'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'

/** Resolve public peer packages from the native library, without app aliases. */
export const EMBED_VUE_HOST_ROOT = join(MCP_REPOSITORY_ROOT, 'packages/histoire-vue')

/** Shared public-package bundler for ordinary hosts and compiled consumer SFCs. */
export function buildEmbedVueHostModule(contents: string) {
  return build({
    stdin: { resolveDir: EMBED_VUE_HOST_ROOT, contents },
    outfile: 'native.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
    define: { '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false', 'process.env.NODE_ENV': '"production"' },
  })
}

/** Bundle genuine host Vue and published native entry together, without repository aliases. */
export async function createEmbedVueHostAssets() {
  const [javascript, stylesheet] = await Promise.all([
    buildEmbedVueHostModule(`export {createHistoireSession} from '@histoire/sdk'; export {subscribeHistoireMountEvents} from '@histoire/sdk/internal'; export {createApp,defineComponent,h,ref,onMounted} from 'vue'; export {createRouter,createWebHistory,RouterLink,RouterView} from 'vue-router'; export * from '@histoire/vue'; export {useHistoireContext,HistoireDropdown} from '@histoire/vue/internal'; export {HstText,HstSelect,HstJson} from '@histoire/controls/vue';`),
    // Native host fixtures serve one generated stylesheet, so embed peer fonts instead of producing asset URLs without a server route.
    build({ entryPoints: [join(EMBED_VUE_HOST_ROOT, 'dist/style.css')], bundle: true, write: false, loader: { '.woff2': 'dataurl' } }),
  ])
  return {
    '/native.js': { body: javascript.outputFiles[0].text },
    '/native.css': { body: stylesheet.outputFiles[0].text, contentType: 'text/css' },
  }
}

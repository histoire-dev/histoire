import { join } from 'node:path'
import { build } from 'esbuild'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'

/** Bundle genuine host Vue and published native entry together, without repository aliases. */
export async function createEmbedVueHostAssets() {
  const resolveDir = join(MCP_REPOSITORY_ROOT, 'packages/histoire-vue')
  const [javascript, stylesheet] = await Promise.all([
    build({
      stdin: { resolveDir, contents: `export {createHistoireSession} from '@histoire/sdk'; export {subscribeHistoireMountEvents} from '@histoire/sdk/internal'; export {createApp,defineComponent,h,ref,onMounted} from 'vue'; export {createRouter,createWebHistory,RouterLink,RouterView} from 'vue-router'; export * from '@histoire/vue'; export {useHistoireContext,HistoireDropdown} from '@histoire/vue/internal'; export {HstText,HstSelect,HstJson} from '@histoire/controls/vue';` },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      define: { '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false', 'process.env.NODE_ENV': '"production"' },
    }),
    build({ entryPoints: [join(resolveDir, 'dist/style.css')], bundle: true, write: false }),
  ])
  return {
    '/native.js': { body: javascript.outputFiles[0].text },
    '/native.css': { body: stylesheet.outputFiles[0].text, contentType: 'text/css' },
  }
}

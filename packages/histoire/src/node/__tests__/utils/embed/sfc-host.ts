import { createRequire } from 'node:module'
import { join } from 'node:path'
import { buildEmbedVueHostModule, EMBED_VUE_HOST_ROOT } from './vue-host.js'

/** Compile actual generated SFC with host Vue and public Histoire packages. */
export async function createEmbedSfcHostAssets(source: string) {
  const require = createRequire(join(EMBED_VUE_HOST_ROOT, 'package.json'))
  const { parse, compileScript } = require('vue/compiler-sfc')
  const { descriptor, errors } = parse(source)
  if (errors.length) throw errors[0]
  const script = compileScript(descriptor, { id: 'embed-consumer', inlineTemplate: true, genDefaultAs: 'component' })
  const result = await buildEmbedVueHostModule(`${script.content}\nexport default component;\nexport {createApp} from 'vue';`)
  return {
    javascript: result.outputFiles.find(file => file.path.endsWith('.js'))!.text,
    stylesheet: result.outputFiles.find(file => file.path.endsWith('.css'))!.text,
  }
}

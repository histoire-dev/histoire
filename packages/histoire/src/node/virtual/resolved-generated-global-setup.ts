import type { Context } from '../context.js'
import { GENERATED_SETUP_CODE } from './index.js'
import { ID_SEPARATOR } from './util.js'

export function resolvedGeneratedGlobalSetup(ctx: Context) {
  if (ctx.config.setupCode) {
    return [
      // Import
      `${ctx.config.setupCode.map((c, index) => `import * as setup_${index} from '${GENERATED_SETUP_CODE}${ID_SEPARATOR}${index}'`).join('\n')}`,
      // List
      `const setupList = [${ctx.config.setupCode.map((c, index) => `setup_${index}`).join(', ')}]`,
      // Private metadata consumed by generated test collection; wrapper export
      // alone is insufficient because it exists even when no vanilla hook does.
      `export const hasSetupVanilla = setupList.some(setup => typeof setup?.setupVanilla === 'function')`,
      // Setups
      ...ctx.supportPlugins.map(p => p.setupFn).flat().map(fnName => `export async function ${fnName} (payload) {
        for (const setup of setupList) {
          if (setup?.${fnName}) {
            await setup.${fnName}(payload)
          }
        }
      }`),
    ].join('\n')
  }
  else {
    return 'export const hasSetupVanilla = false'
  }
}

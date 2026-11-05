import type { ChangeRequest, ManualStep, PluginDetail } from '../types/marketplace.js'
import { pluginOptions } from './options.js'

/** Browser fallback config instructions when no reviewed server snippet exists. */
export function manualConfigSteps(request: ChangeRequest, detail: PluginDetail): ManualStep[] {
  const factory = detail.manifest.config.import
  const values = pluginOptions(detail.manifest.config.options ?? [], request.options)
  const serialized = Object.keys(values).length ? JSON.stringify(values, null, 2) : ''
  return [
    { title: 'Update histoire.config.ts', code: request.kind === 'remove'
      ? `Remove the ${factory}() entry and unused import from histoire.config.ts.`
      : `import { ${factory} } from '${detail.id}'\n\n// ${request.kind === 'options' ? 'Update this call in' : 'Add this call to'} the plugins array in histoire.config.ts\n${factory}(${serialized})` },
    { title: 'Restart Histoire' },
  ]
}

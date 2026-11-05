import type { ChangePlan, ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import { printValue } from '../../config/codemod/source-edit.js'
import { pluginOptions } from './options.js'
import { packageCommand } from './package-manager.js'

/** Builds copyable commands and literal snippet without an executable capability. */
export function manualPlan(reason: NonNullable<ChangePlan['manual']>['reason'], request: ChangeRequest, manifest: MarketplaceManifest): NonNullable<ChangePlan['manual']> {
  const steps = (['pnpm', 'npm', 'yarn', 'bun'] as const).flatMap((name) => {
    const command = packageCommand({ name, source: 'override', workspaceRoot: false }, request)
    return command ? [{ title: `Run with ${name}`, code: command.display }] : []
  })
  const values = pluginOptions(manifest.config.options ?? [], request.options)
  const call = `${manifest.config.import}(${Object.keys(values).length ? printValue('', values) : ''})`
  steps.push({
    title: request.kind === 'remove' ? 'Remove the plugin call and unused import from your config' : 'Update your Histoire config',
    code: `import { ${manifest.config.import} } from ${printValue('', request.id)}\n\n// ${request.kind === 'remove' ? 'Remove' : 'Add or update'} this entry in plugins:\n${call}`,
  })
  return { reason, steps }
}

import type { ChangePlan, ChangeRequest, PluginDetail } from '@histoire/shared'
import { createMarketplaceClient } from '../../../util/marketplace-client.js'

/** Reuse static client's safe option serializer instead of duplicating snippet generation. */
export async function manualInstructions(request: ChangeRequest, detail: PluginDetail, reviewed: ChangePlan): Promise<ChangePlan> {
  const client = createMarketplaceClient({
    transport: { available: () => false, send: () => false, on: () => () => {} },
    loadOfficial: async () => [detail],
  })
  const names = ['pnpm', 'npm', 'yarn', 'bun'] as const
  const alternatives = await Promise.all(names.map(packageManager => client.plan({ ...request, prefs: { ...request.prefs, packageManager } })))
  const original = reviewed.manual?.steps ?? alternatives[names.indexOf(reviewed.packageManager.name)].manual!.steps
  // Server manual plans already include all manager commands. Preserve their exact bytes.
  if (original.some(step => step.title.startsWith('Run with '))) return reviewed
  const commands = request.kind === 'options'
    ? []
    : alternatives.map((plan, index) => ({
        title: `Run with ${names[index]}`,
        code: names[index] === reviewed.packageManager.name && reviewed.command ? reviewed.command.display : plan.manual!.steps[0].code,
      }))
  const steps = original.filter(step => !['Install package', 'Remove package'].includes(step.title))
  return { ...reviewed, manual: { reason: reviewed.manual?.reason ?? 'config-not-literal', steps: [...commands, ...steps] } }
}

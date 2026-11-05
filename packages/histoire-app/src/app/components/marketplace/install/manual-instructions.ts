import type { ChangePlan, ChangeRequest, PluginDetail } from '@histoire/shared'
import { executablePackageManagers, manualConfigSteps, packageCommand } from '@histoire/shared'

/** Add copyable manager alternatives while retaining reviewed commands and config bytes. */
export async function manualInstructions(request: ChangeRequest, detail: PluginDetail, reviewed: ChangePlan): Promise<ChangePlan> {
  const commands = executablePackageManagers.flatMap((name) => {
    const command = packageCommand({ name, workspaceRoot: false }, { ...request, version: request.version ?? detail.latest })
    if (!command) return []
    return [{ title: `Run with ${name}`, code: name === reviewed.packageManager.name && reviewed.command ? reviewed.command.display : command.display }]
  })
  const codes = new Set(commands.map(command => command.code))
  // Match command bytes rather than English titles. Keep server-provided steps
  // intact, including workspace-specific flags not inferable in the browser.
  const original = reviewed.manual?.steps
  if (original && commands.length && commands.every(command => original.some(step => step.code === command.code))) return reviewed
  const steps = (original ?? manualConfigSteps(request, detail)).filter(step => !codes.has(step.code ?? '') && !['Install package', 'Remove package'].includes(step.title))
  return { ...reviewed, manual: { reason: reviewed.manual?.reason ?? 'config-not-literal', steps: [...commands, ...steps] } }
}

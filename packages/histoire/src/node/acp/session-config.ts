import type { SessionConfigOption, SessionConfigSelect, SessionConfigSelectOption, SetSessionConfigOptionResponse } from '@agentclientprotocol/sdk'
import type { UiAgentConfigOptions, UiAgentConfigSelector, UiAgentSettings } from '@histoire/shared'
import type { createAgentRuntime } from './agent-runtime.js'
import { methods } from '@agentclientprotocol/sdk'
import { withAgentTimeout } from './agent-runtime.js'

/** Recognized category uses agent ordering to choose one prominent selector. */
function select(options: SessionConfigOption[], category: string): (SessionConfigSelect & { id: string }) | undefined {
  return options.find(option => option.category === category && option.type === 'select') as (SessionConfigSelect & { id: string }) | undefined
}

/** Flatten groups while retaining their display labels and exact agent value IDs. */
function projectSelector(option?: SessionConfigSelect & { id: string }): UiAgentConfigSelector | undefined {
  if (!option) return undefined
  return { configId: option.id, currentValue: option.currentValue, options: option.options.flatMap((item) => {
    if ('group' in item) return item.options.map(value => ({ value: value.value, label: value.name, group: item.name }))
    const value = item as SessionConfigSelectOption
    return [{ value: value.value, label: value.name }]
  }).filter(item => item.value !== 'default') }
}

/** Public choices omit raw SDK metadata and unrelated configuration categories. */
export function projectAgentConfig(agentId: string, options: SessionConfigOption[], warning?: string): UiAgentConfigOptions {
  return { agentId, model: projectSelector(select(options, 'model')), effort: projectSelector(select(options, 'thought_level')), warning }
}

/** Apply model first so dependent effort choices come from accepted model response. */
export async function applyAgentSessionDefaults(runtime: ReturnType<typeof createAgentRuntime>, sessionId: string, preset: UiAgentSettings['presets'][number], initial: SessionConfigOption[], timeout: number, isOwned: () => boolean) {
  let options = initial
  const warnings: string[] = []
  for (const [field, category] of [['model', 'model'], ['effort', 'thought_level']] as const) {
    const value = preset[field]
    if (!value || (field === 'model' && value === 'default')) continue
    const option = select(options, category)
    if (!option) {
      warnings.push(`Saved ${field} is unsupported; using agent default`)
      continue
    }
    if (option.currentValue === value) continue
    try {
      const response = await withAgentTimeout(runtime.connection.agent.request<SetSessionConfigOptionResponse>(methods.agent.session.setConfigOption, { sessionId, configId: option.id, value }), timeout, 'ACP configuration timed out')
      if (!isOwned()) throw new Error('Agent runtime closed')
      options = response.configOptions
    }
    catch {
      if (!isOwned()) throw new Error('Agent runtime closed')
      warnings.push(`Saved ${field} was rejected; using agent accepted configuration`)
    }
  }
  return { options, warning: warnings.length ? warnings.join('. ') : undefined }
}

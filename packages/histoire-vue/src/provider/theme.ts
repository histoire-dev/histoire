import type { HistoireSourceConfig } from '@histoire/protocol'
import { getHistoireColorChannels, getHistoireSemanticThemeOverrides, parseColor } from '@histoire/protocol'

/** Project palette stays on owning provider; channels/alpha also feed peer controls and replicas. */
export function getHistoireThemeVariables(config: HistoireSourceConfig | undefined, dark: boolean): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const [color, shades] of Object.entries(config?.theme.colors ?? {})) {
    for (const [shade, input] of Object.entries(shades)) {
      const parsed = parseColor(input)
      if (!parsed) continue
      const value = getHistoireColorChannels(parsed)
      const name = `--_histoire-color-${color}-${shade}`
      variables[name] = value.channels
      variables[`${name}-alpha`] = value.alpha
    }
  }
  const overrides = getHistoireSemanticThemeOverrides(config?.theme.colors, dark)
  Object.assign(variables, overrides)
  for (const name of Object.keys(overrides)) {
    if (!name.endsWith('-rgb')) continue
    const role = name.slice(0, -4)
    variables[role] = `rgb(var(${name}) / var(${role}-alpha, ${role === '--histoire-accent-soft' && dark ? '.12' : '1'}))`
  }
  return variables
}

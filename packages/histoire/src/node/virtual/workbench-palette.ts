import type { HistoireConfig } from '@histoire/shared'
import { getHistoireSemanticThemeOverrides } from '@histoire/protocol'

/** Workbench roots own semantic palette overrides; preview content stays independent. */
const root = ':is(.histoire-app.histoire-provider,.histoire-workbench,.histoire-root)'

/** Shared portable shade mapping prevents native/iframe providers from restoring legacy defaults. */
function declarations(theme: HistoireConfig['theme'], dark: boolean): string {
  return Object.entries(getHistoireSemanticThemeOverrides(theme?.colors, dark)).map(([name, value]) => `${name}: ${value};`).join('')
}

/** Emit only project overrides; authored tokens remain the default design authority. */
export function resolvedWorkbenchPalette(theme: HistoireConfig['theme']) {
  return `${root}{${declarations(theme, false)}}:is(.htw-dark,[data-histoire-appearance="dark"]) ${root},${root}:is(.htw-dark,[data-histoire-appearance="dark"]){${declarations(theme, true)}}`
}

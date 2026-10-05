import type { HistoireSourceConfig } from '@histoire/protocol'
import { expect, it } from 'vitest'
import { defaultColors } from '../../../histoire/src/node/colors.js'
import { getHistoireThemeVariables } from '../provider/theme.js'

/** Theme-only projection needs no session, runtime or duplicated catalog fixture. */
function config(colors: Record<string, Record<string, string>>): HistoireSourceConfig {
  return { theme: { colors } } as HistoireSourceConfig
}

it.each([false, true])('leaves C1 semantic defaults intact for resolved source palette (dark: %s)', (dark) => {
  const variables = getHistoireThemeVariables(config({ gray: defaultColors.zinc, primary: defaultColors.emerald }), dark)
  expect(Object.keys(variables).filter(name => name.startsWith('--histoire-'))).toEqual([])
  expect(variables['--_histoire-color-primary-500']).toBe('16 185 129')
})

it('maps only customized semantic shades with shared workbench roles and alpha', () => {
  const source = config({ primary: { 500: '#123456', 400: '#abcdef80' }, gray: { 950: '#010203', 800: 'invalid' } })
  const light = getHistoireThemeVariables(source, false)
  const dark = getHistoireThemeVariables(source, true)
  expect(light['--histoire-accent-rgb']).toBe('var(--_histoire-color-primary-500)')
  expect(dark['--histoire-accent-rgb']).toBe('var(--_histoire-color-primary-400)')
  expect(dark['--_histoire-color-primary-400-alpha']).toBe('0.5019607843137255')
  expect(dark['--histoire-input-rgb']).toBe('var(--_histoire-color-gray-950)')
  expect(dark['--histoire-input']).toBe('rgb(var(--histoire-input-rgb) / var(--histoire-input-alpha, 1))')
  expect(dark).not.toHaveProperty('--histoire-border')
})

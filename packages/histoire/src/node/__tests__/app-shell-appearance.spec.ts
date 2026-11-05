import type { HistoireThemeConfig } from '@histoire/shared'
import { startupBackground } from '@histoire/dev-proxy/appearance'
import { describe, expect, it } from 'vitest'
import { getAppShellAppearanceScript } from '../vite/app-shell-appearance.js'

interface RunOptions {
  /** Theme options of the project. */
  theme?: Partial<HistoireThemeConfig>
  /** Value stored under the color scheme key in `localStorage`. */
  local?: string
  /** Value stored under the color scheme key in `sessionStorage`. */
  session?: string
  /** Whether the system prefers dark. */
  systemDark?: boolean
}

/** Runs the pre-paint script against a fake document and returns the root element state. */
function run({ theme = {}, local, session, systemDark = false }: RunOptions) {
  const root = { style: {} as Record<string, string>, classList: new Set<string>() }
  const storage = (value?: string) => ({ getItem: (key: string) => key === 'histoire-color-scheme' ? value ?? null : null })
  const script = getAppShellAppearanceScript({ defaultColorScheme: 'auto', storeColorScheme: true, ...theme } as HistoireThemeConfig)
  // eslint-disable-next-line no-new-func
  new Function('document', 'localStorage', 'sessionStorage', 'matchMedia', script)(
    { documentElement: { style: root.style, classList: { add: (name: string) => root.classList.add(name) } } },
    storage(local),
    storage(session),
    () => ({ matches: systemDark }),
  )
  return root
}

describe('app shell appearance script', () => {
  it('paints the stored scheme over the system one', () => {
    const root = run({ local: 'dark', systemDark: false })
    expect(root.style.backgroundColor).toBe(startupBackground.dark)
    expect(root.classList.has('htw-dark')).toBe(true)
  })

  it('follows the system when the default scheme is auto and nothing is stored', () => {
    expect(run({ systemDark: true }).style.backgroundColor).toBe(startupBackground.dark)
    expect(run({ systemDark: false }).style.backgroundColor).toBe(startupBackground.light)
  })

  it('falls back to the configured default scheme', () => {
    const root = run({ theme: { defaultColorScheme: 'light' }, systemDark: true })
    expect(root.style.backgroundColor).toBe(startupBackground.light)
    expect(root.classList.has('htw-dark')).toBe(false)
  })

  it('reads session storage when the scheme is not persisted', () => {
    const root = run({ theme: { storeColorScheme: false }, local: 'light', session: 'dark' })
    expect(root.style.backgroundColor).toBe(startupBackground.dark)
  })
})

import type { AddKind, Category } from '@histoire/shared'

/** Shared visible category names for navigation, facets and cards. */
export const categories: Record<Category, string> = { testing: 'Testing', design: 'Design', inspection: 'Inspection', frameworks: 'Frameworks', data: 'Data & mocks' }
/** Shared contribution labels, avoiding raw protocol values in controls. */
export const additions: Record<AddKind, string> = { 'rail-pane': 'Project pane', 'inspector-tab': 'Inspector tab', 'toolbar-tool': 'Toolbar tool', 'story-tests': 'Story tests', 'cli-command': 'CLI command', 'settings-section': 'Settings section', 'canvas-view': 'Canvas view' }
/** Human-readable stack names, preserving unknown framework names. */
export function frameworkLabel(value: string): string {
  const name = ({ vue: 'Vue 3', react: 'React', svelte: 'Svelte', vite: 'Vite', tailwindcss: 'Tailwind CSS', vitest: 'Vitest' } as Record<string, string>)[value]
  return name ?? value.replace(/^vite (?=\d+$)/, 'Vite ')
}

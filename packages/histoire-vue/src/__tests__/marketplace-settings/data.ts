import type { MarketplaceUpdate } from '../../../../histoire-shared/src/index.js'

/** Installed data comes from the virtual configuration boundary, not mocked UI logic. */
export const plugins = [
  { name: 'vue', packageName: '@histoire/plugin-vue', displayName: 'Vue', version: '1.0.0', required: true, builtin: false, local: false, official: true, enabled: true, client: true, frame: true, toggleId: 'vue-toggle' },
  { name: 'a11y', packageName: '@histoire/plugin-a11y', displayName: 'Accessibility', version: '1.1.0', required: false, builtin: false, local: false, official: true, enabled: true, client: true, frame: true, toggleId: 'a11y-toggle', docsUrl: 'https://example.com/docs', repoUrl: 'https://example.com/repo' },
  { name: 'designs', packageName: '@histoire/plugin-designs', displayName: 'Designs', version: '1.2.0', required: false, builtin: false, local: false, official: true, enabled: true, client: true, frame: true },
  { name: 'custom', displayName: 'Custom', version: 'local', required: false, builtin: false, local: true, official: false, enabled: true, client: true, frame: false },
]

/** Distinct safe and breaking targets expose update-all ordering and exclusion. */
export const updates: MarketplaceUpdate[] = [
  { id: '@histoire/plugin-a11y', from: '1.1.0', to: '1.1.1', breaking: false },
  { id: '@histoire/plugin-vue', from: '1.0.0', to: '2.0.0', breaking: true },
  { id: '@histoire/plugin-designs', from: '1.2.0', to: '1.2.1', breaking: false },
]

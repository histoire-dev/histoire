import type { PluginApiBase } from '@histoire/shared'
import type { TailwindSnapshot } from './types.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'pathe'
import { resolveHistoireAppBundledDir } from '../../util/resolve-histoire-app.js'
import { tryResolveDependency } from '../../util/resolve-package.js'
import { getInjectedImport } from '../../util/vendors.js'

/** Packaged runtime needs explicit Vite filesystem ownership outside project root. */
export const tailwindRuntimeDirectory = fileURLToPath(new URL('./runtime/', import.meta.url))

/** Render tiny generated module; executable UI stays in maintained runtime sources. */
export function tailwindStoryTemplate(api: PluginApiBase, snapshot: TailwindSnapshot, stylesheet: string): string {
  const style = tryResolveDependency(api.root, '@histoire/controls/dist/style-standalone.css')
  const runtime = fileURLToPath(new URL('./runtime/story.js', import.meta.url))
  const emptyState = resolve(resolveHistoireAppBundledDir(), 'components/shell/WorkbenchEmptyState.vue.js')
  return `${style ? `import ${getInjectedImport(style)}\n` : ''}import './${stylesheet}'\nimport { createTailwindStory } from ${getInjectedImport(runtime)}\nimport WorkbenchEmptyState from ${getInjectedImport(emptyState)}\nexport default createTailwindStory(${JSON.stringify(snapshot)}, WorkbenchEmptyState)\n`
}

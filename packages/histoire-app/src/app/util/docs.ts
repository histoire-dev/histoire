import type { Story, Variant } from '../types'
import { clientSupportPlugins } from 'virtual:$histoire-support-plugins-client'
import { getDynamicSourceCode as deriveDynamicSource } from './dynamic-source.js'

/** Resolve support plugin only inside existing story runtime/standalone adapter. */
export async function getDynamicSourceCode(story: Story, variant: Variant) {
  return deriveDynamicSource(variant, async (target) => {
    const clientPlugin = clientSupportPlugins[story.file?.supportPluginId]
    const pluginModule = clientPlugin ? await clientPlugin() : null
    return pluginModule?.generateSourceCode(target)
  })
}

/** Legacy copy action retains raw fallback; SDK dynamic mode uses helper above. */
export async function getSourceCode(story: Story, variant: Variant) {
  const dynamic = await getDynamicSourceCode(story, variant)
  if (dynamic) return dynamic.body

  const sourceLoader = story.file?.source
  if (sourceLoader) {
    return (await sourceLoader()).default
  }
}

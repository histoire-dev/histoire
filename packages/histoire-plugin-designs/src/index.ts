import type { HistoireJsonValue } from '@histoire/protocol'
import type { Plugin } from '@histoire/shared'
import type { DesignsOptions } from './options.js'
import { fileURLToPath } from 'node:url'
import { normalizeOptions } from './options.js'

export type { DesignsOptions } from './options.js'
export type { DesignInput, EmbedDesignInput, EmbedDesignType, ImageDesignInput, LinkDesignInput } from './types.js'

/**
 * Show designs declared in story and variant `meta.design` next to the rendered variant.
 * @param options Plugin options.
 */
export function HstDesigns(options: DesignsOptions = {}): Plugin {
  const browser = normalizeOptions(options)
  return {
    name: '@histoire/plugin-designs',
    metadata: { displayName: 'Designs', description: 'Figma, Penpot, Sketch and image designs next to stories', icon: 'color-palette', docsUrl: 'https://histoire.dev/guide/plugins/designs.html', repoUrl: 'https://github.com/histoire-dev/histoire/tree/main/packages/histoire-plugin-designs' },
    workbench: options.enabled === false
      ? undefined
      : {
          id: 'designs',
          apiVersion: 1,
          client: fileURLToPath(new URL('./client.js', import.meta.url)),
          options: browser as unknown as HistoireJsonValue,
          devOnly: options.devOnly ?? false,
        },
  }
}

import type { TerminalCommandHandler } from '../registry.js'
import { parseCatalogListArgs, parseCatalogVariantsArgs } from '@histoire/cli/protocol/catalog'
import { getCatalogService } from '../catalog/index.js'

/**
 * Handlers of the `catalog.*` namespace: revision-pinned, bounded pages over the
 * canonical catalog of the current generation. Each validates its own arguments.
 */
export const catalogHandlers: readonly TerminalCommandHandler[] = [
  {
    operation: 'catalog.list',
    async handle(args, context) {
      return getCatalogService(context).list(parseCatalogListArgs(args))
    },
  },
  {
    operation: 'catalog.variants',
    async handle(args, context) {
      return getCatalogService(context).variants(parseCatalogVariantsArgs(args))
    },
  },
]

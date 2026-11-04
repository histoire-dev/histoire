import type { TerminalCommandHandler } from '../registry.js'
import { boundSessionText } from '@histoire/cli/protocol/session'
import { resolveConfigFile } from '@histoire/dev-proxy/config'
import { version as viteVersion } from 'vite'
import { readHistoireVersion } from '../../../mcp/package-version.js'
import { getSessionMcp } from '../session-info.js'

/**
 * Handlers of the `session.*` namespace. `session.get` projects bounded,
 * credential-free facts of the current generation; the parent combines them
 * with its own lifecycle, URL and phase knowledge. Slice 06 adds diagnostics
 * operations by contributing its own handlers to `handlers/index.ts`.
 */
export const sessionHandlers: readonly TerminalCommandHandler[] = [
  {
    operation: 'session.get',
    async handle(_args, context) {
      const { root, configFile } = context.handle.context
      const snapshot = context.catalog?.current
      const config = resolveConfigFile(root, configFile)
      return {
        histoire: readHistoireVersion(),
        node: process.version,
        vite: viteVersion,
        root: boundSessionText(root),
        ...(config ? { configFile: boundSessionText(config) } : {}),
        ...(snapshot
          ? { collection: { stories: snapshot.stories.length, variants: snapshot.stories.reduce((total, story) => total + story.variants.length, 0), outcome: snapshot.outcome, diagnostics: snapshot.diagnostics.length } }
          : {}),
        mcp: getSessionMcp(),
      }
    },
  },
]

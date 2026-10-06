import type { Plugin } from '@histoire/shared'
import type { TailwindTokensOptions } from './tailwind/types.js'
import { createTailwindSession } from './tailwind/session.js'

export type { TailwindTokensOptions } from './tailwind/types.js'

/** Automatically document the captured project's Tailwind v3 or v4 design tokens. */
export function tailwindTokens(options: TailwindTokensOptions = {}): Plugin {
  return {
    name: 'builtin:tailwind-tokens',
    async onDev(api, onCleanup) {
      if (options.enabled === false) return
      const session = createTailwindSession(api, options, true)
      onCleanup(() => session.close())
      await session.watch(api)
      await session.refresh()
    },
    async onBuild(api) {
      if (options.enabled === false) return
      const session = createTailwindSession(api, options, false)
      api.getContext().onCleanup(() => session.close())
      await session.refresh()
    },
  }
}

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Resolve tooling from its owning package without requiring built workspaces. */
export const marketplaceRequire = createRequire(new URL('../../packages/histoire/package.json', import.meta.url))
const { createJiti } = marketplaceRequire('jiti')

/** Load shared validation from source for release prep and docs CI. */
export const marketplaceSource = createJiti(import.meta.url, {
  alias: {
    '@histoire/shared/dist/icons/index.js': fileURLToPath(new URL('../../packages/histoire-shared/src/icons/index.ts', import.meta.url)),
    '@histoire/shared': fileURLToPath(new URL('../../packages/histoire-shared/src/marketplace/index.ts', import.meta.url)),
  },
})

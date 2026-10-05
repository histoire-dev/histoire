import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Setup virtual modules exist only in Histoire's runtime. */
export default defineConfig({
  resolve: {
    alias: {
      'virtual:$histoire-generated-global-setup': fileURLToPath(new URL('./src/__tests__/generated-setup.ts', import.meta.url)),
      'virtual:$histoire-setup': fileURLToPath(new URL('./src/__tests__/setup.ts', import.meta.url)),
    },
  },
  test: { environment: 'jsdom' },
})

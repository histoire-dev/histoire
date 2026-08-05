import type { StaticMockOptions } from './types.js'
import { resolveFallbackUrl, resolveStaticMockUrl } from './mock-urls.js'

/**
 * Creates the RPC shape consumed by Vitest's browser mocker in static previews.
 *
 * In dev the mocker talks to the Vite dev server over HMR; a built preview has
 * no server, so the same contract is answered from the emitted chunks instead.
 */
export function createStaticPreviewMockRpc() {
  return {
    async resolveId(id: string, importer: string) {
      const resolvedUrl = await resolveStaticMockUrl(id, importer) ?? resolveFallbackUrl(id, importer)
      return {
        id: resolvedUrl,
        url: resolvedUrl,
        optimized: false,
      }
    },
    async resolveMock(id: string, importer: string, options: StaticMockOptions = {}) {
      const resolvedUrl = await resolveStaticMockUrl(id, importer) ?? resolveFallbackUrl(id, importer)

      return {
        mockType: options.mock === 'factory' ? 'manual' : options.mock === 'spy' ? 'autospy' : 'automock',
        needsInterop: false,
        redirectUrl: null,
        resolvedId: resolvedUrl,
        resolvedUrl,
      }
    },
    async invalidate() {},
  }
}

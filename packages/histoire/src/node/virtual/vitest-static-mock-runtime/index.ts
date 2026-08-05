/**
 * Static (build mode) Vitest mock runtime.
 *
 * A built Histoire preview has no Vite dev server to resolve mocked modules,
 * so this module answers Vitest's browser mocker contract from the emitted
 * chunks and routes mocked imports through MSW's service worker.
 *
 * It is imported by the generated preview runtime (see
 * `virtual/preview-runtime/preamble.ts`), which is why the public surface is
 * kept to the three entry points that runtime references.
 */
export { enableStaticPreviewMockInterception } from './interception.js'
export { createStaticPreviewMockRpc } from './mock-rpc.js'
export { findStaticMockImportUrl, findStaticMockLoaderImportUrl } from './mock-urls.js'
export { createStaticPreviewMswOptions } from './service-worker.js'
export type { StaticPreviewMocker } from './types.js'

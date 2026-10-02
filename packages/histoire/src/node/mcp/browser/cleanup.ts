/** Reuse SDK-free confirmed browser teardown for preview and project Vitest jobs. */
export { closePlaywrightBrowser as closePreviewBrowser } from '../../util/playwright-cleanup.js'
export type { PlaywrightCleanupOutcome as PreviewCleanupOutcome } from '../../util/playwright-cleanup.js'

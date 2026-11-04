import type { TerminalBridge } from '../bridge.js'
import type { CatalogListArgs, CatalogListPage, CatalogVariantsArgs, CatalogVariantsPage } from '../protocol/catalog.js'
import { CATALOG_STALE_MESSAGE } from '../protocol/catalog.js'
import { TerminalError } from '../protocol/core.js'

/** Typed wrappers of the `catalog.*` operations over the generic bridge. */
export interface CatalogClient {
  /** Reads one page of matching stories. */
  list: (args: CatalogListArgs) => Promise<CatalogListPage>
  /** Reads one page of a story's variants. */
  variants: (args: CatalogVariantsArgs) => Promise<CatalogVariantsPage>
}

/**
 * Creates the typed client. Pure sugar over `bridge.send`; holds no state.
 * @param bridge Parent bridge (or any object with a compatible `send`).
 */
export function createCatalogClient(bridge: Pick<TerminalBridge, 'send'>): CatalogClient {
  return {
    list: args => bridge.send('catalog.list', args),
    variants: args => bridge.send('catalog.variants', args),
  }
}

/**
 * Whether a failed read says its expected revision is no longer current. The read must then
 * restart from the first page; pages of two revisions are never combined.
 * @param error Rejection of a catalog read.
 */
export function isStaleCatalogRead(error: unknown): boolean {
  return error instanceof TerminalError && error.code === 'failed' && error.message === CATALOG_STALE_MESSAGE
}

/**
 * Whether a failed read belongs to a generation that no longer exists. Nothing is shown for
 * it: the progress mirror already moved on and the successor generation is read afresh.
 * @param error Rejection of a catalog read.
 */
export function isRetiredCatalogRead(error: unknown): boolean {
  return error instanceof TerminalError && (error.code === 'retired' || error.code === 'closed')
}

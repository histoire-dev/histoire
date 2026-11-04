/** Tab JS heap (bytes) above which a spec frees the documents of finished spec files first. */
export const FINISHED_SPECS_GC_THRESHOLD = 256 * 1024 ** 2

/** Page globals read to decide on a collection. */
interface PageScope {
  /** Collector exposed by `--js-flags=--expose-gc`. */
  gc?: () => void
  /** Chromium heap figures, live with `--enable-precise-memory-info`. */
  performance?: { memory?: { usedJSHeapSize: number } }
}

/**
 * Frees the documents of finished spec files before this one runs. Vitest runs every spec file in
 * a fresh iframe and drops the previous one, but Chromium collects removed documents only near its
 * heap limit: each test tab otherwise grows by gigabytes of dead documents. Histoire launches its
 * test browser with an exposed collector; anywhere else this is a no-op.
 * @param scope Page globals.
 */
export function releaseFinishedSpecs(scope: PageScope = globalThis as PageScope): void {
  if (typeof scope.gc !== 'function') return
  // Without heap figures, collecting unconditionally stays correct, only slower.
  const heap = scope.performance?.memory?.usedJSHeapSize
  if (heap === undefined || heap > FINISHED_SPECS_GC_THRESHOLD) scope.gc()
}

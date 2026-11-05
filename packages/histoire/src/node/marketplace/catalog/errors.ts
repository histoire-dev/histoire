/** Missing catalog identity, distinct from unavailable sources and invalid requests. */
export class CatalogNotFoundError extends Error {
  /** Stable transport code; callers must not inspect translated messages. */
  readonly code = 'not-found'

  /** Create a safe public missing-package error. */
  constructor() {
    super('Plugin not found')
    this.name = 'CatalogNotFoundError'
  }
}

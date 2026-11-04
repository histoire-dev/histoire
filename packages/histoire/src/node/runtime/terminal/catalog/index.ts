import type { TerminalHandlerContext } from '../registry.js'
import type { CatalogService } from './service.js'
import { createCatalogService } from './service.js'

/** One service per runtime generation; it dies with the handle (observers detach on the adapter's abort). */
const services = new WeakMap<object, CatalogService>()

/**
 * Returns the catalog service of the context's generation, creating it (and its
 * state observers) on first use.
 * @param context Handler context of the current generation.
 */
export function getCatalogService(context: TerminalHandlerContext): CatalogService {
  let service = services.get(context.handle)
  if (!service) {
    service = createCatalogService({ handle: context.handle, catalog: context.catalog, emit: context.emit, signal: context.signal })
    services.set(context.handle, service)
  }
  return service
}

export type { CatalogService, CatalogServiceOptions } from './service.js'

import type { Context } from '../../context.js'
import type { RuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { CatalogError } from '../../runtime/catalog/types.js'
import { createRuntimeContent } from '../../runtime/content/service.js'
import { createEmbedDescriptor } from './descriptor.js'
import { getEmbedSourceId } from './identity.js'
import { projectEmbedSearch } from './search.js'

/** Projects one canonical completed provider into a data-only embed source. */
export function createEmbedSource(ctx: Context, catalog: RuntimeCatalog, namespace: 'embed' | 'local' = 'embed') {
  const content = createRuntimeContent({ root: ctx.root, catalog })
  return {
    /** Reads current detached publication; failed collection remains diagnostic data. */
    getDescriptor() {
      if (!catalog.current) throw new CatalogError('PROJECT_STARTING', 'Source catalog is starting', true)
      return createEmbedDescriptor(ctx, catalog.current, 'dev', undefined, namespace)
    },
    /** Shared provider supplies lazy registered docs without source execution. */
    getDocs: content.getDocs,
    /** Shared provider supplies lazy raw source without source execution. */
    getSource: content.getSource,
    /** Search uses completed portable targets and preferred docs text. */
    getSearch() { return projectEmbedSearch(catalog.current) },
    /** Observes coherent catalog/content revisions with caller-owned disposal. */
    subscribe(listener: (descriptor: ReturnType<typeof createEmbedDescriptor>) => void) {
      return catalog.subscribe(snapshot => listener(createEmbedDescriptor(ctx, snapshot, 'dev', undefined, namespace)))
    },
    /** Captured provider used by writer; private handles never enter descriptor. */
    catalog,
  }
}

/** Captures completed build data through canonical engine, without a collector or browser. */
export async function captureEmbedSource(ctx: Context) {
  const catalog = createRuntimeCatalog({ projectId: getEmbedSourceId(ctx.root), epoch: 'build', root: ctx.root })
  await catalog.publish(ctx)
  return createEmbedSource(ctx, catalog)
}

/** Trusted source document projection consumed by dev routes/build writer. */
export type EmbedSource = ReturnType<typeof createEmbedSource>

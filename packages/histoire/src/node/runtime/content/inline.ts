import type { Context } from '../../context.js'
import { getContextRegistry } from '../registry.js'

/** Rendered transform output, tied to exact physical source bytes. */
interface InlineDocs {
  /** HTML from configured existing Markdown renderer. */
  html: string
  /** Original Markdown text. */
  text: string
  /** Full story source digest at transform. */
  sourceSha256: string
}

/** Each context owns its transform capture and cleanup lifetime. */
const captures = new WeakMap<Context, Map<string, InlineDocs>>()

/** Captures inline docs during normal transformation, never importing story later. */
export function captureInlineDocs(ctx: Context, path: string, docs: InlineDocs): void {
  let entries = captures.get(ctx)
  if (!entries) {
    captures.set(ctx, entries = new Map())
    getContextRegistry(ctx).cleanup.add(() => {
      captures.delete(ctx)
    })
  }
  entries.set(path, Object.freeze({ ...docs }))
}

/** Returns only docs transformed from this completed source version. */
export function getInlineDocs(ctx: Context, path: string, sourceSha256: string): InlineDocs | undefined {
  const docs = captures.get(ctx)?.get(path)
  return docs?.sourceSha256 === sourceSha256 ? docs : undefined
}

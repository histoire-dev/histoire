import { normalize } from 'pathe'
import { hashContent } from '../../runtime/content/hash.js'

/** Stable opaque book identity shared by dev handles/builds; private Node project IDs stay separate. */
export function getEmbedSourceId(root: string): string {
  return hashContent(`histoire-book:${normalize(root).replace(/\/$/, '')}`)
}

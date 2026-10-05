import { createHash } from 'node:crypto'

/** Hashes exact complete UTF-8 text without any page normalization. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

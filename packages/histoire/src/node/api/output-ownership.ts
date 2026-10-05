import { relative, resolve, sep } from 'node:path'
import { HistoireSdkError } from '@histoire/protocol'
import { canonicalOutput } from '../build/node/layout.js'

/** Process-local ownership protects destructive builds, including output aliases. */
const outputs = new Set<{ path: string, kind: 'build' | 'preview' }>()

/** Determines whether replacing either path could destroy the other's assets. */
function overlaps(first: string, second: string): boolean {
  const inside = (root: string, file: string) => {
    const path = relative(root, file)
    return !path || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep))
  }
  return inside(first, second) || inside(second, first)
}

/** Claims canonical output before reading a preview or writing any build assets. */
export async function claimOutput(output: string, kind: 'build' | 'preview'): Promise<() => void> {
  const path = await canonicalOutput(resolve(output))
  for (const current of outputs) {
    if (!overlaps(current.path, path) || (kind === 'preview' && current.kind === 'preview')) continue
    throw new HistoireSdkError('RUNTIME_IN_USE', current.kind === 'preview' ? 'Cannot build over an active preview output' : 'A build already owns this output')
  }
  const claim = { path, kind }
  outputs.add(claim)
  return () => {
    outputs.delete(claim)
  }
}

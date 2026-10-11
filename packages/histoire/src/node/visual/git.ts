import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** Bounded subprocess reader with arguments, never shell interpolation. */
const execute = promisify(execFile)

/** Pin Git authority once, accounting for projects nested inside monorepos. */
export async function createVisualGitReader(root: string, ref: string) {
  const options = { cwd: root, timeout: 5000, maxBuffer: 4 * 1024 * 1024 + 1024 }
  let commit: string
  let prefix: string
  try {
    commit = (await execute('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], options)).stdout.trim()
    prefix = (await execute('git', ['rev-parse', '--show-prefix'], options)).stdout.trim()
  }
  catch {
    throw new Error(`Visual baseline ref unavailable: ${ref}. Fetch or create this ref before comparing.`)
  }
  if (!/^[a-f0-9]{40,64}$/.test(commit)) {
    throw new Error('Invalid visual baseline commit')
  }
  return {
    commit,
    /** Missing blob is explicit absence; only regular tracked files are accepted. */
    async read(path: string): Promise<Uint8Array | undefined> {
      if (path.startsWith('/') || path.split('/').some(part => part === '..' || !part) || path.includes('\\')) {
        throw new Error('Invalid Git baseline path')
      }
      const gitPath = `${prefix}${path}`
      const listing = (await execute('git', ['ls-tree', '--full-tree', '-z', commit, '--', gitPath], options)).stdout
      if (!listing) {
        return
      }
      if (!listing.startsWith('100644 blob ') && !listing.startsWith('100755 blob ')) {
        throw new Error('Git baseline must be a regular file')
      }
      const blob = listing.split(' ')[2]?.split('\t')[0]
      if (!blob || !/^[a-f0-9]{40,64}$/.test(blob)) {
        throw new Error('Invalid Git baseline blob')
      }
      return (await execute('git', ['cat-file', 'blob', blob], { ...options, encoding: 'buffer' })).stdout
    },
  }
}

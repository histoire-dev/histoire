import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'pathe'
import { onTestFinished } from 'vitest'

/** Deny real persistence; restore permissions if the scratch project survives teardown. */
export async function denyRegistryCacheWrites(root: string) {
  const directory = join(root, 'node_modules/.cache/histoire/marketplace/registry')
  await mkdir(directory, { recursive: true })
  onTestFinished(() => chmod(directory, 0o700).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  }))
  await chmod(directory, 0o500)
  return directory
}

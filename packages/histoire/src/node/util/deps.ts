import { dirname, join } from 'pathe'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const isInHistoireMonorepo = __dirname.includes(join('packages', 'histoire', 'dist'))

export function getInjectedImport (request: string) {
  return JSON.stringify(isInHistoireMonorepo ? require.resolve(request) : request)
}

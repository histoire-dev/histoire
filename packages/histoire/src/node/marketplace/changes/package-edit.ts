import type { ChangeRequest } from '@histoire/shared'

/** Simulates the dependency edit for review; the package manager owns real writes. */
export function editPackageJson(code: string, request: ChangeRequest): string {
  if (request.kind === 'options') return code
  const data = JSON.parse(code || '{}')
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid project package.json')
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (data[key] && (typeof data[key] !== 'object' || Array.isArray(data[key]))) throw new Error(`Invalid ${key}`)
    if (data[key]) delete data[key][request.id]
  }
  if (request.kind !== 'remove') {
    data.devDependencies ??= {}
    data.devDependencies[request.id] = `${request.kind === 'pin' ? '' : '^'}${request.version}`
    data.devDependencies = Object.fromEntries(Object.entries(data.devDependencies).sort(([a], [b]) => a.localeCompare(b)))
  }
  const indent = /\n([\t ]+)\S/.exec(code)?.[1] ?? '  '
  const newline = code.includes('\r\n') ? '\r\n' : '\n'
  return JSON.stringify(data, null, indent).replace(/\n/g, newline) + newline
}

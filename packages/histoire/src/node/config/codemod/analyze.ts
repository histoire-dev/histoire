import type { ConfigAccessOptions, ConfigPathAnalysis } from './types.js'
import { readFile } from 'node:fs/promises'
import { locateConfigObject } from './locate.js'
import { parseConfigCode, parseIssue } from './parse.js'
import { parseConfigPath } from './paths.js'
import { guardConfigFile } from './security.js'
import { locateConfigPath, staticValue } from './walk.js'

/** Reports whether one allowlisted option can be edited, with source provenance. */
export async function analyzeConfigPath(file: string, path: string, options: ConfigAccessOptions = {}): Promise<ConfigPathAnalysis> {
  const tokens = parseConfigPath(path)
  await guardConfigFile(file, options)
  let code: string
  try {
    code = await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' }
    throw error
  }
  let parsed: ReturnType<typeof parseConfigCode>
  try {
    parsed = parseConfigCode(code)
  }
  catch (error) {
    return parseIssue(error)
  }
  const config = locateConfigObject(parsed)
  if (config.issue) return config.issue
  const result = locateConfigPath(parsed, config.object, tokens)
  if (result.issue) return result.issue
  if (!result.node) return { status: 'absent' }
  const value = staticValue(parsed, result.node)
  if (value.issue) return value.issue
  const source = result.property ?? result.node
  return { status: 'editable', location: source.loc ? { line: source.loc.start.line, column: source.loc.start.column + 1 } : undefined }
}

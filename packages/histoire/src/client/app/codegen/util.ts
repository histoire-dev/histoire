import { genObjectFromRaw, genArrayFromRaw } from 'knitwork'

export function indent (lines: string[], count = 1) {
  return lines.map(line => `${'  '.repeat(count)}${line}`)
}

export function serializeJs (value: any): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return `'${value}'`
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return genArrayFromRaw(value)
  }
  if (typeof value === 'object') {
    return genObjectFromRaw(value)
  }
  return value.toString()
}

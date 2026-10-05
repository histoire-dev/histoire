import type { ASTNode } from 'magicast'
import type { ArrayNode, JsonValue, ObjectNode, ParsedConfig, PropertyNode, SourceEdit } from './types.js'
import { builders, detectCodeFormat, generateCode } from 'magicast'

/** Gets local indentation without changing any existing source line. */
export function sourceIndent(code: string, offset: number): string {
  const line = code.slice(code.lastIndexOf('\n', offset - 1) + 1, offset)
  return /^[\t ]*/.exec(line)[0]
}

/** Prints new JSON expressions with recast literals and the project's quotes. */
export function printValue(code: string, value: JsonValue, literalQuote?: 'single' | 'double'): string {
  const format = detectCodeFormat(code)
  const quote = literalQuote ?? (/['"]/.test(code) ? format.quote : 'single')
  /** Prints nested containers compactly; untouched containers are never printed. */
  function print(item: JsonValue): string {
    if (Array.isArray(item)) return `[${item.map(print).join(', ')}]`
    if (item && typeof item === 'object') {
      const properties = Object.entries(item).map(([key, entry]) => `${/^[a-z_$][\w$]*$/i.test(key) ? key : print(key)}: ${print(entry)}`)
      return properties.length ? `{ ${properties.join(', ')} }` : '{}'
    }
    return generateCode(builders.literal(item), { quote }).code
  }
  return print(value)
}

/** Replaces only the selected expression, leaving comments and siblings intact. */
export function replaceNode(node: ASTNode, code: string): SourceEdit {
  return { start: node.start, end: node.end, code }
}

/** Appends one property/element with the container's indentation and commas. */
export function appendEntry(parsed: ParsedConfig, container: ObjectNode | ArrayNode, entry: string): SourceEdit[] {
  const code = parsed.code
  const children = container.type === 'ObjectExpression' ? container.properties : container.elements.filter(Boolean)
  const last = children.at(-1)
  const close = container.end - 1
  const inner = code.slice(container.start + 1, close)
  if (!inner.includes('\n')) {
    const position = close
    if (!last) return [{ start: close, end: close, code: `${inner && /\s$/.test(inner) ? '' : ' '}${entry} ` }]
    const trailingComma = commaAfterTrivia(code, last.end, close) !== undefined
    return [{ start: position, end: position, code: `${trailingComma ? '' : ','} ${entry}${trailingComma ? ',' : ''} ` }]
  }
  const newline = code.includes('\r\n') ? '\r\n' : '\n'
  const closeLine = code.lastIndexOf('\n', close - 1) + 1
  const closingWhitespace = code.slice(closeLine, close)
  const closingIndent = /^\s*$/.test(closingWhitespace) ? closingWhitespace : sourceIndent(code, container.start)
  const format = detectCodeFormat(code)
  const indent = children.length ? sourceIndent(code, children[0].start) : closingIndent + (format.useTabs ? '\t' : ' '.repeat(format.tabWidth || 2))
  const hasComma = last && commaAfterTrivia(code, last.end, close) !== undefined
  const edits: SourceEdit[] = []
  if (last && !hasComma) edits.push({ start: last.end, end: last.end, code: ',' })
  const position = /^\s*$/.test(closingWhitespace) ? closeLine : close
  const prefix = /^\s*$/.test(closingWhitespace) ? '' : newline
  const suffix = hasComma || (!last && format.trailingComma) ? ',' : ''
  edits.push({ start: position, end: position, code: `${prefix}${indent}${entry}${suffix}${newline}${prefix ? closingIndent : ''}` })
  return edits
}

/** Finds punctuation beyond authored comments without consuming or rewriting their bytes. */
function commaAfterTrivia(code: string, start: number, end: number): number | undefined {
  let index = start
  while (index < end) {
    if (/\s/.test(code[index])) {
      index++
    }
    else if (code.startsWith('/*', index)) {
      index = code.indexOf('*/', index + 2) + 2
    }
    else if (code.startsWith('//', index)) {
      const line = code.slice(index + 2, end).search(/[\r\n\u2028\u2029]/)
      index = line === -1 ? end : index + 2 + line
    }
    else {
      return code[index] === ',' ? index : undefined
    }
  }
}

/** Deletes a property and its own comma, retaining unrelated comments. */
export function removeProperty(parsed: ParsedConfig, property: PropertyNode): SourceEdit {
  const code = parsed.code
  let start = property.start
  let end = property.end
  const comma = commaAfterTrivia(code, end, code.length)
  const trivia = comma === undefined ? '' : code.slice(end, comma)
  if (comma !== undefined) end = comma + 1
  // Comment trivia belongs to authored source even when its adjacent key is removed.
  if (trivia.trim()) return { start, end, code: trivia }
  const lineStart = code.lastIndexOf('\n', start - 1) + 1
  const after = /^[\t ]*\r?\n/.exec(code.slice(end))
  if (/^[\t ]*$/.test(code.slice(lineStart, start)) && after) {
    start = lineStart
    end += after[0].length
  }
  else {
    const space = /^[\t ]*/.exec(code.slice(end))[0]
    end += space.length
  }
  return { start, end, code: '' }
}

/** Applies disjoint edits in reverse offset order so original ranges stay valid. */
export function applySourceEdits(code: string, edits: SourceEdit[]): string {
  const deduplicated = new Map<string, SourceEdit>()
  for (const edit of edits) {
    const key = `${edit.start}:${edit.end}`
    const previous = deduplicated.get(key)
    if (previous && previous.code !== edit.code) throw new Error('Overlapping config source edits')
    deduplicated.set(key, edit)
  }
  const ordered = [...deduplicated.values()].sort((a, b) => b.start - a.start || b.end - a.end)
  let boundary = code.length
  for (const edit of ordered) {
    if (edit.end > boundary) throw new Error('Overlapping config source edits')
    code = code.slice(0, edit.start) + edit.code + code.slice(edit.end)
    boundary = edit.start
  }
  return code
}

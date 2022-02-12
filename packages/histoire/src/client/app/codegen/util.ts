export function indent (lines: string[], count = 1) {
  return lines.map(line => `${'  '.repeat(count)}${line}`)
}

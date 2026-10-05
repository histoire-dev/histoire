/** Build valid TS/JS for manual insertion when a config option is computed. */
export function createConfigSnippet(path: string, value: unknown): string {
  let object: unknown = value
  for (const segment of path.split('.').reverse()) object = { [segment]: object }
  return `import { defineConfig } from 'histoire'\n\nexport default defineConfig(${JSON.stringify(object, null, 2)})\n`
}

/** Show changed value lines with small context; never expose or fetch whole config source. */
export function previewConfigValueDiff(path: string, before: unknown, after: unknown): string {
  const previous = JSON.stringify(before, null, 2)?.split('\n') ?? []
  const next = JSON.stringify(after, null, 2)?.split('\n') ?? []
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++
  let end = 0
  while (end < previous.length - start && end < next.length - start && previous[previous.length - end - 1] === next[next.length - end - 1]) end++
  if (start === previous.length && start === next.length) return `${path}: unchanged`
  const lines = [
    `${path}:`,
    ...(start > 2 ? ['  …'] : []),
    ...previous.slice(Math.max(0, start - 2), start).map(line => `  ${line}`),
    ...previous.slice(start, previous.length - end).map(line => `- ${line}`),
    ...next.slice(start, next.length - end).map(line => `+ ${line}`),
    ...next.slice(next.length - end, next.length - end + 2).map(line => `  ${line}`),
    ...(end > 2 ? ['  …'] : []),
  ]
  return [...lines.slice(0, 40), ...(lines.length > 40 ? ['  …'] : [])].join('\n')
}

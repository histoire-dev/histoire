import type { ChangePlan, DiffLine } from '@histoire/shared'

/** Splits source lines; terminators remain represented by exact internal sources. */
function lines(code: string): string[] {
  if (!code) return []
  const result = code.split('\n')
  if (result.at(-1) === '') result.pop()
  return result
}

/** Builds exact line operations using Myers' shortest-edit-path algorithm. */
function operations(before: string[], after: string[]): DiffLine[] {
  const frontier = new Map<number, number>([[1, 0]])
  const trace: Map<number, number>[] = []
  for (let distance = 0; distance <= before.length + after.length; distance++) {
    // Bound worst-case memory for entirely different large files. A whole-file
    // replacement remains an exact diff, though less compact than a shortest one.
    if (distance > 1000) return [...before.map(text => ({ kind: 'del' as const, text })), ...after.map(text => ({ kind: 'add' as const, text }))]
    trace.push(new Map(frontier))
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x = diagonal === -distance || (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1))
        ? frontier.get(diagonal + 1) ?? 0
        : (frontier.get(diagonal - 1) ?? 0) + 1
      let y = x - diagonal
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x++
        y++
      }
      frontier.set(diagonal, x)
      if (x >= before.length && y >= after.length) {
        const result: DiffLine[] = []
        for (let step = distance; step >= 0; step--) {
          const previous = trace[step]
          const current = x - y
          const next = current === -step || (current !== step && (previous.get(current - 1) ?? -1) < (previous.get(current + 1) ?? -1)) ? current + 1 : current - 1
          const previousX = previous.get(next) ?? 0
          const previousY = previousX - next
          while (x > previousX && y > previousY) {
            result.push({ kind: 'context', text: before[--x] })
            y--
          }
          if (!step) break
          if (x === previousX) result.push({ kind: 'add', text: after[--y] })
          else result.push({ kind: 'del', text: before[--x] })
        }
        return result.reverse()
      }
    }
  }
  return []
}

/** Returns line counts and at most three context lines around each changed hunk. */
export function fileDiff(file: string, before: string, after: string): ChangePlan['files'][number] {
  const all = before === after ? [] : operations(lines(before), lines(after))
  const selected = new Set<number>()
  for (let index = 0; index < all.length; index++) {
    if (all[index].kind === 'context') continue
    for (let offset = Math.max(0, index - 3); offset <= Math.min(all.length - 1, index + 3); offset++) selected.add(offset)
  }
  return {
    path: file,
    added: all.filter(line => line.kind === 'add').length,
    removed: all.filter(line => line.kind === 'del').length,
    lines: all.filter((_, index) => selected.has(index)),
  }
}

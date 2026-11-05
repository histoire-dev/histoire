import { Buffer } from 'node:buffer'
import { createControlStripper } from '@histoire/cli/sanitize'

/** Redacts URL userinfo, sensitive query values and common npm token syntax. */
export function sanitizeOutput(text: string): string {
  return text.replace(/(https?:\/\/)[^\s/]*@/gi, '$1[credential]@')
    .replace(/([?&](?:token|access_token|auth|password|key|secret|signature)=)[^\s&#]*/gi, '$1[credential]')
    .replace(/((?:_authToken|_password|authorization)\s*[:=]\s*)\S+/gi, '$1[credential]')
}

/** Both streams share one retained-output budget while keeping separate partial lines. */
const budgets = new WeakMap<string[], { /** Serialized array bytes, including separators. */ bytes: number }>()

/** Keeps complete sanitized lines without publishing credential fragments between chunks. */
export function createJobOutput(lines: string[], changed: () => void) {
  const strip = createControlStripper()
  const budget = budgets.get(lines) ?? { bytes: Buffer.byteLength(JSON.stringify(lines)) }
  budgets.set(lines, budget)
  let pending = ''
  let dropping = false
  /** Retains bounded complete lines; JSON overhead is counted before publication. */
  function append(line: string) {
    const sanitized = sanitizeOutput(line).slice(0, 2000)
    budget.bytes += Buffer.byteLength(JSON.stringify(sanitized)) + (lines.length ? 1 : 0)
    lines.push(sanitized)
    while (lines.length > 400 || budget.bytes > 40000) {
      budget.bytes -= Buffer.byteLength(JSON.stringify(lines.shift()!)) + (lines.length ? 1 : 0)
    }
    changed()
  }
  return {
    /** Decodes complete logical lines while bounding even unterminated output. */
    write(text: string) {
      for (const char of strip(text)) {
        if (char === '\n' || char === '\r') {
          if (!dropping) append(pending)
          else append('[Output line omitted: too long]')
          pending = ''
          dropping = false
        }
        else if (!dropping) {
          pending += char
          if (pending.length > 8000) {
            pending = ''
            dropping = true
          }
        }
      }
    },
    /** Flushes final output only after stream ownership ends. */
    finish() {
      if (pending || dropping) append(dropping ? '[Output line omitted: too long]' : pending)
      pending = ''
      dropping = false
    },
  }
}

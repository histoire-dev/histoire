import { transform as lightningcssTransform } from 'lightningcss'

export interface WrapOptions {
  scopeRoot: string
}

export interface WrapWithLowerOptions {
  scopeRoot: string
  scopeLower: string
}

export function wrapUserCss(css: string, opts: WrapOptions): string {
  const trimmed = css.trimStart()
  if (trimmed.startsWith('@scope')) {
    return css
  }
  const { hoisted, remainder } = extractHoistableAtRules(css)
  const body = remainder.includes(':root')
    ? rewriteRootToScope(remainder)
    : remainder
  const hoistedBlock = hoisted.length > 0 ? `${hoisted.join('\n')}\n` : ''
  return `${hoistedBlock}@scope (${opts.scopeRoot}) {\n${body}\n}\n`
}

export function wrapChromeCss(css: string, opts: WrapWithLowerOptions): string {
  const trimmed = css.trimStart()
  if (trimmed.startsWith('@scope (')) {
    return css
  }
  const { hoisted, remainder } = extractHoistableAtRules(css)
  // Rewrite `:root` to `:scope` so source-level `@scope (:root) to (...)` rules
  // nest correctly under the outer scope; without this, the inner `:root`
  // resolves to the document root, which is outside the outer scope range.
  const body = remainder.includes(':root')
    ? rewriteRootToScopeRegex(remainder)
    : remainder
  const hoistedBlock = hoisted.length > 0 ? `${hoisted.join('\n')}\n` : ''
  return `${hoistedBlock}@scope (${opts.scopeRoot}) to (${opts.scopeLower}) {\n${body}\n}\n`
}

export function isGlobalImport(id: string): boolean {
  const q = id.indexOf('?')
  if (q === -1) return false
  const parts = id.slice(q + 1).split('&')
  return parts.includes('global') || parts.some(p => p.startsWith('global='))
}

function rewriteRootToScope(css: string): string {
  const processed = lightningcssTransform({
    filename: 'user.css',
    code: Buffer.from(css, 'utf8'),
    minify: false,
    visitor: {
      Selector(selector) {
        for (const part of selector) {
          if (part.type === 'pseudo-class' && (part as any).kind === 'root') {
            ;(part as any).kind = 'scope'
          }
        }
        return selector
      },
    },
  })
  return Buffer.from(processed.code).toString('utf8')
}

function rewriteRootToScopeRegex(css: string): string {
  return css
    .replace(/@scope\s*\(\s*:root\s*\)/g, '@scope (:scope)')
    .replace(/([^\w-]|^):root(?![\w-])/g, '$1:scope')
}

const HOIST_SEMI_RE = /^[ \t]*@(?:import|charset|namespace)\s+[^;]+;[ \t]*\n?/gm
// Top-level `@font-face { ... }` only — no nested braces (the `[^}]*` body
// matcher does not handle them, but font-face properties are flat).
const HOIST_FONT_FACE_RE = /^[ \t]*@font-face\s*\{[^}]*\}[ \t]*\n?/gm

function extractHoistableAtRules(css: string): { hoisted: string[], remainder: string } {
  const hoisted: string[] = []
  let remainder = css

  remainder = remainder.replace(HOIST_SEMI_RE, (match) => {
    hoisted.push(match.trim())
    return ''
  })
  remainder = remainder.replace(HOIST_FONT_FACE_RE, (match) => {
    hoisted.push(match.trim())
    return ''
  })

  return { hoisted, remainder }
}

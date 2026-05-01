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
  // Rewrite `:root` to `:scope` so source-level `@scope (:root) to (...)`
  // rules nest correctly under the outer scope; without this, the inner
  // `:root` resolves to the document root which is outside the outer scope.
  const body = remainder.includes(':root')
    ? rewriteRootToScope(remainder)
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

// Top-level at-rule extraction. Anchored to line start with optional leading
// whitespace; covers the formatted output produced by Vite/PostCSS. Inputs
// with rules on the same line as other rules, or strings/comments containing
// `;`/`}`, are not handled — these are extremely rare in practice and would
// only mis-classify within a generated histoire-app or vendor stylesheet.
const HOIST_SEMI_RE = /^[ \t]*@(?:import|charset|namespace)\s+[^;]+;[ \t]*\n?/gm
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

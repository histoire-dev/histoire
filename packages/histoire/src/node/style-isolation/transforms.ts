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
  const processed = lightningcssTransform({
    filename: 'user.css',
    code: Buffer.from(remainder, 'utf8'),
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
  const body = Buffer.from(processed.code).toString('utf8')
  const hoistedBlock = hoisted.length > 0 ? `${hoisted.join('\n')}\n` : ''
  return `${hoistedBlock}@scope (${opts.scopeRoot}) {\n${body}\n}\n`
}

export function wrapChromeCss(css: string, opts: WrapWithLowerOptions): string {
  const trimmed = css.trimStart()
  if (trimmed.startsWith('@scope (')) {
    return css
  }

  const { hoisted, remainder } = extractHoistableAtRules(css)

  // Rewrite any existing `:root` references to `:scope` so source-level
  // `@scope (:root) to (...)` rules nest correctly under our outer scope.
  // Without this, the inner `:root` resolves to the document root which is
  // outside the outer `@scope (.histoire-app-root)` range, so nothing matches.
  const rewritten = remainder
    .replace(/@scope\s*\(\s*:root\s*\)/g, '@scope (:scope)')
    .replace(/([^\w-]|^):root(?![\w-])/g, '$1:scope')

  const processed = lightningcssTransform({
    filename: 'chrome.css',
    code: Buffer.from(rewritten, 'utf8'),
    minify: false,
  })
  const body = Buffer.from(processed.code).toString('utf8')

  const hoistedBlock = hoisted.length > 0 ? `${hoisted.join('\n')}\n` : ''
  return `${hoistedBlock}@scope (${opts.scopeRoot}) to (${opts.scopeLower}) {\n${body}\n}\n`
}

export function isGlobalImport(id: string): boolean {
  const queryStart = id.indexOf('?')
  if (queryStart === -1) return false
  const params = new URLSearchParams(id.slice(queryStart + 1))
  return params.has('global')
}

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

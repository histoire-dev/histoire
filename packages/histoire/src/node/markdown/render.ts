import type { Context } from '../context.js'
import MarkdownIt from 'markdown-it'
import { assertMarkdownActive, getMarkdownHighlighter } from './highlighter.js'

/** Prepared HTML generation contains no asynchronous publication boundary. */
export interface PreparedMarkdown {
  /** Renders through the configured parser's rules and the captured environment. */
  render: () => string
}

/** Reads fence info exactly like MarkdownIt's renderer, after core plugins ran. */
function fenceLanguages(md: MarkdownIt, tokens: ReturnType<MarkdownIt['parse']>): string[] {
  return tokens.flatMap((token) => {
    const languages = token.type === 'fence'
      ? [md.utils.unescapeAll(token.info ?? '').trim().split(/\s+/)[0]]
      : []
    return [...languages, ...(token.children ? fenceLanguages(md, token.children) : [])]
  })
}

/** Parses once and completes grammar loading before shared records can be changed. */
export async function prepareMarkdown(ctx: Context, md: MarkdownIt, source: string, env: Record<string, unknown> = {}): Promise<PreparedMarkdown> {
  const highlighter = getMarkdownHighlighter(ctx)
  if (md.render !== MarkdownIt.prototype.render) {
    // A whole-method replacement may create its own token stream or inject
    // fences. Keep that supported callback intact rather than bypassing it.
    await highlighter.prepareAll()
    return { render() {
      assertMarkdownActive(ctx)
      return md.render(source, env)
    } }
  }
  const tokens = md.parse(source, env)
  await highlighter.prepare(fenceLanguages(md, tokens))
  return { render() {
    assertMarkdownActive(ctx)
    return md.renderer.render(tokens, md.options, env)
  } }
}

/** Renders standalone transform input after its context-owned preparation completes. */
export async function renderMarkdown(ctx: Context, md: MarkdownIt, source: string, env: Record<string, unknown> = {}) {
  const prepared = await prepareMarkdown(ctx, md, source, env)
  return prepared.render()
}

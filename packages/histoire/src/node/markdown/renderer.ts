import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import attrs from 'markdown-it-attrs'
import { full as emoji } from 'markdown-it-emoji'
import path from 'pathe'
import pc from 'picocolors'
import { bundledLanguages, createHighlighter } from 'shiki'
import { slugify } from '../util/slugify.js'

/** Creates existing Markdown renderer and story-aware relative link handling. */
export async function createMarkdownRenderer(ctx: Context) {
  const highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: Object.keys(bundledLanguages), // not ideal but markdown-it does not provide async highlight
  })

  const md = new MarkdownIt({
    highlight: (code, lang) => `<div class="htw-relative htw-not-prose __histoire-code"><div class="htw-absolute htw-top-0 htw-right-0 htw-text-xs htw-text-white/40">${lang}</div>${highlighter.codeToHtml(code, { theme: 'github-dark', lang })}</div>`,
    linkify: true,
    html: true,
    breaks: false,
  })

  md.use(anchor, {
    slugify,
    permalink: anchor.permalink.ariaHidden({}),
  })
    .use(attrs)
    .use(emoji)

  // External links
  {
    const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      const token = tokens[idx]
      const hrefIndex = token.attrIndex('href')
      const classIndex = token.attrIndex('class')

      if (hrefIndex >= 0) {
        const href = token.attrs[hrefIndex][1]
        if (href.startsWith('.')) {
          const queryIndex = href.indexOf('?')
          const pathname = queryIndex >= 0 ? href.slice(0, queryIndex) : href
          const query = queryIndex >= 0 ? href.slice(queryIndex) : ''

          // File lookup
          const file = path.resolve(path.dirname(env.file), pathname)
          const storyFile = ctx.storyFiles.find(f => f.path === file)
          const mdFile = ctx.markdownFiles.find(f => f.absolutePath === file)
          if (!storyFile && !mdFile?.storyFile) {
            throw new Error(pc.red(`[md] Cannot find story file: ${pathname} from ${env.file}`))
          }

          // Add attributes
          const newHref = `${ctx.resolvedViteConfig.base}story/${encodeURIComponent(storyFile?.id ?? mdFile.storyFile.id)}${query}`
          token.attrSet('href', newHref)
          token.attrSet('data-route', 'true')
        }
        else if (!href.startsWith('/') && !href.startsWith('#') && (classIndex < 0 || !token.attrs[classIndex][1].includes('header-anchor'))) {
          // Add target="_blank" to external links
          const aIndex = token.attrIndex('target')

          if (aIndex < 0) {
            token.attrPush(['target', '_blank']) // add new attribute
          }
          else {
            token.attrs[aIndex][1] = '_blank' // replace value of existing attr
          }
        }
      }

      // pass token to default renderer.
      return defaultRender(tokens, idx, options, env, self)
    }
  }

  return md
}

/** Applies configured Markdown plugin hook once to the shared renderer. */
export async function createMarkdownRendererWithPlugins(ctx: Context) {
  let md = await createMarkdownRenderer(ctx)
  if (ctx.config.markdown) {
    const result = await ctx.config.markdown(md)
    if (result) {
      md = result
    }
  }
  return md
}

/** Creates Vue inline documentation transform using the shared renderer. */
export async function createMarkdownPlugins(ctx: Context) {
  const plugins: VitePlugin[] = []
  const md = await createMarkdownRendererWithPlugins(ctx)

  // @TODO extract
  plugins.push({
    name: 'histoire-vue-docs-block',
    transform(code, id) {
      if (!id.includes('?vue&type=docs')) return
      if (!id.includes('lang.md')) return
      const file = id.substring(0, id.indexOf('?vue'))
      const html = md.render(code, {
        file,
      })
      return `export default Comp => {
        Comp.doc = ${JSON.stringify(html)}
      }`
    },
  })

  return plugins
}

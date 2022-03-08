import MarkdownIt from 'markdown-it'
import shiki from 'shiki'
import anchor from 'markdown-it-anchor'
import attrs from 'markdown-it-attrs'
import emoji from 'markdown-it-emoji'
import { slugify } from './util/slugify.js'

export async function createMarkdownRenderer () {
  const highlighter = await shiki.getHighlighter({
    theme: 'github-dark',
  })

  const md = new MarkdownIt({
    highlight: (code, lang) => `<div class="htw-relative htw-not-prose __histoire-code"><div class="htw-absolute htw-top-0 htw-right-0 htw-text-xs htw-text-white/40">${lang}</div>${highlighter.codeToHtml(code, {
      lang,
    })}</div>`,
    linkify: true,
    html: true,
    breaks: true,
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
      const hrefIndex = tokens[idx].attrIndex('href')
      const classIndex = tokens[idx].attrIndex('class')

      if (hrefIndex >= 0 && !tokens[idx].attrs[hrefIndex][1].startsWith('/') && (classIndex < 0 || !tokens[idx].attrs[classIndex][1].includes('header-anchor'))) {
        // If you are sure other plugins can't add `target` - drop check below
        const aIndex = tokens[idx].attrIndex('target')

        if (aIndex < 0) {
          tokens[idx].attrPush(['target', '_blank']) // add new attribute
        } else {
          tokens[idx].attrs[aIndex][1] = '_blank' // replace value of existing attr
        }
      }

      // pass token to default renderer.
      return defaultRender(tokens, idx, options, env, self)
    }
  }

  return md
}

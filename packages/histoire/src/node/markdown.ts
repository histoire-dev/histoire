import type { ServerMarkdownFile } from '@histoire/shared'
import type { Plugin as VitePlugin } from 'vite'
import type { Context } from './context.js'
import { kebabCase } from 'change-case'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import attrs from 'markdown-it-attrs'
import { full as emoji } from 'markdown-it-emoji'
import micromatch from 'micromatch'
import path from 'pathe'
import pc from 'picocolors'
import { bundledLanguages, createHighlighter } from 'shiki'
import { addStory, notifyStoryChange, removeStory } from './stories.js'
import { slugify } from './util/slugify.js'

const onMarkdownListChangeHandlers: (() => unknown)[] = []

export function onMarkdownListChange(handler: () => unknown) {
  onMarkdownListChangeHandlers.push(handler)
}

function notifyMarkdownListChange() {
  for (const handler of onMarkdownListChangeHandlers) {
    handler()
  }
}

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

async function createMarkdownRendererWithPlugins(ctx: Context) {
  let md = await createMarkdownRenderer(ctx)
  if (ctx.config.markdown) {
    const result = await ctx.config.markdown(md)
    if (result) {
      md = result
    }
  }
  return md
}

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

export async function createMarkdownFilesWatcher(ctx: Context) {
  const md = await createMarkdownRendererWithPlugins(ctx)

  const watcher = chokidar.watch('.', {
    cwd: ctx.root,
    ignored: (path, stats) => {
      if (ctx.config.storyIgnored.some(pattern => micromatch.isMatch(path, pattern))) {
        return true
      }
      if (micromatch.isMatch(path, '**/*.story.md')) {
        return false
      }

      return stats?.isFile()
    },
  })

  /**
   * Initial scan is complete.
   */
  let watcherIsReady = false

  function addFile(relativePath: string) {
    const absolutePath = path.resolve(ctx.root, relativePath)
    const dirFiles = fs.readdirSync(path.dirname(absolutePath))
    const truncatedName = path.basename(absolutePath, '.md')
    const isRelatedToStory = dirFiles.some(file => !file.endsWith('.md') && file.startsWith(truncatedName))

    const { data: frontmatter, content } = matter(fs.readFileSync(absolutePath, 'utf8'))

    let html: string | undefined

    // We don't immediately render markdown during initial scanning in case
    // markdown references other files in links (otherwise they might not
    // be scanned yet and will throw 'not found' errors).
    if (watcherIsReady) {
      html = md.render(content, {
        file: absolutePath,
      })
    }

    const file: ServerMarkdownFile = {
      id: kebabCase(relativePath.toLowerCase()),
      relativePath,
      absolutePath,
      isRelatedToStory,
      frontmatter,
      content,
      html,
    }
    ctx.markdownFiles.push(file)

    if (!isRelatedToStory) {
      const storyRelativePath = relativePath.replace(/\.md$/, '.js')
      const storyFile = addStory(storyRelativePath, `export default ${JSON.stringify({
        id: frontmatter.id,
        title: frontmatter.title,
        icon: frontmatter.icon ?? 'carbon:document-blank',
        iconColor: frontmatter.iconColor,
        group: frontmatter.group,
        docsOnly: true,
        variants: [],
      })}`)
      file.storyFile = storyFile
      storyFile.markdownFile = file
      notifyStoryChange(storyFile)
    }
    else {
      const searchPath = path.join(path.dirname(relativePath), truncatedName)
      const storyFile = ctx.storyFiles.find(f => f.relativePath.startsWith(searchPath))
      if (storyFile) {
        file.storyFile = storyFile
        storyFile.markdownFile = file
        notifyStoryChange(storyFile)
      }
    }

    notifyMarkdownListChange()

    return file
  }

  function removeFile(relativePath: string) {
    const index = ctx.markdownFiles.findIndex(file => file.relativePath === relativePath)
    if (index !== -1) {
      const file = ctx.markdownFiles[index]
      if (!file.isRelatedToStory) {
        removeStory(file.storyFile.relativePath)
        notifyStoryChange()
      }
      ctx.markdownFiles.splice(index, 1)
      notifyMarkdownListChange()
    }
  }

  async function stop() {
    await watcher.close()
  }

  watcher
    .on('add', (relativePath) => {
      addFile(relativePath)
    })
    .on('unlink', (relativePath) => {
      removeFile(relativePath)
    })

  await new Promise((resolve) => {
    watcher.once('ready', resolve as () => void)
  })

  try {
    // Render markdown after initial scan is complete.
    for (const mdFile of ctx.markdownFiles) {
      mdFile.html = md.render(mdFile.content, {
        file: mdFile.absolutePath,
      })
    }
    watcherIsReady = true

    return {
      stop,
    }
  }
  catch (e) {
    await stop()
    throw e
  }
}

export type MarkdownFilesWatcher = ReturnType<typeof createMarkdownFilesWatcher>

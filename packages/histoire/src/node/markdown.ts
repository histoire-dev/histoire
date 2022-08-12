import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'
import shiki from 'shiki'
import anchor from 'markdown-it-anchor'
import attrs from 'markdown-it-attrs'
import emoji from 'markdown-it-emoji'
import type { Plugin as VitePlugin } from 'vite'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import path from 'pathe'
import type { ServerMarkdownFile } from '@histoire/shared'
import { slugify } from './util/slugify.js'
import type { Context } from './context.js'
import { addStory, notifyStoryChange, removeStory } from './stories.js'

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

      if (hrefIndex >= 0 && !tokens[idx].attrs[hrefIndex][1].startsWith('/') && !tokens[idx].attrs[hrefIndex][1].startsWith('#') && (classIndex < 0 || !tokens[idx].attrs[classIndex][1].includes('header-anchor'))) {
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

async function createMarkdownRendererWithPlugins (ctx: Context) {
  let md = await createMarkdownRenderer()
  if (ctx.config.markdown) {
    const result = await ctx.config.markdown(md)
    if (result) {
      md = result
    }
  }
  return md
}

export async function createMarkdownPlugins (ctx: Context) {
  const plugins: VitePlugin[] = []
  const md = await createMarkdownRendererWithPlugins(ctx)

  // @TODO extract
  plugins.push({
    name: 'histoire-vue-docs-block',
    transform (code, id) {
      if (!id.includes('?vue&type=docs')) return
      if (!id.includes('lang.md')) return
      const html = md.render(code)
      return `export default Comp => {
        Comp.doc = ${JSON.stringify(html)}
      }`
    },
  })

  plugins.push({
    name: 'histoire-markdown-files',
    transform (code, id) {
      if (id.endsWith('.story.md')) {
        const relativePath = path.relative(ctx.root, id)
        const { content, data: frontmatter } = matter(code)
        const html = md.render(content)
        return `export const html = ${JSON.stringify(html)}
export const frontmatter = ${JSON.stringify(frontmatter)}
export const relativePath = ${JSON.stringify(relativePath)}

if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    window.__hst_md_hmr(newModule)
  })
}`
      }
    },
  })

  return plugins
}

export async function createMarkdownFilesWatcher (ctx: Context) {
  const md = await createMarkdownRendererWithPlugins(ctx)

  const watcher = chokidar.watch(['**/*.story.md'], {
    cwd: ctx.root,
    ignored: ctx.config.storyIgnored,
  })

  async function addFile (relativePath: string) {
    const absolutePath = path.resolve(ctx.root, relativePath)
    const dirFiles = await fs.readdir(path.dirname(absolutePath))
    const truncatedName = path.basename(absolutePath, '.md')
    const isRelatedToStory = dirFiles.some((file) => !file.endsWith('.md') && file.startsWith(truncatedName))

    const { data: frontmatter, content } = matter(await fs.readFile(absolutePath, 'utf8'))
    const html = md.render(content)

    const file: ServerMarkdownFile = {
      relativePath,
      absolutePath,
      isRelatedToStory,
      frontmatter,
      html,
    }
    ctx.markdownFiles.push(file)

    if (!isRelatedToStory) {
      const storyRelativePath = relativePath.replace(/\.md$/, '.js')
      const storyFile = addStory(storyRelativePath, `export default ${JSON.stringify({
        id: frontmatter.id,
        title: frontmatter.title,
        icon: frontmatter.icon,
        iconColor: frontmatter.iconColor,
        group: frontmatter.group,
        docsOnly: true,
        variants: [],
      })}`)
      file.storyFile = storyFile
      storyFile.markdownFile = file
      notifyStoryChange(storyFile)
    } else {
      const searchPath = path.join(path.dirname(relativePath), truncatedName)
      const storyFile = ctx.storyFiles.find(f => f.relativePath.startsWith(searchPath))
      if (storyFile) {
        file.storyFile = storyFile
        storyFile.markdownFile = file
        notifyStoryChange(storyFile)
      }
    }

    return file
  }

  function removeFile (relativePath: string) {
    const index = ctx.markdownFiles.findIndex((file) => file.relativePath === relativePath)
    if (index !== -1) {
      const file = ctx.markdownFiles[index]
      if (!file.isRelatedToStory) {
        removeStory(file.storyFile.relativePath)
        notifyStoryChange()
      }
      ctx.markdownFiles.splice(index, 1)
    }
  }

  async function stop () {
    await watcher.close()
  }

  watcher
    .on('add', async (relativePath) => {
      await addFile(relativePath)
    })
    .on('unlink', (relativePath) => {
      removeFile(relativePath)
    })

  await new Promise(resolve => {
    watcher.once('ready', resolve)
  })

  return {
    stop,
  }
}

export type MarkdownFilesWatcher = ReturnType<typeof createMarkdownFilesWatcher>

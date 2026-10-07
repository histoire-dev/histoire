import { writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../markdown/render.js'
import { createMarkdownPlugins, createMarkdownRendererWithPlugins } from '../../markdown/renderer.js'
import { hashContent } from '../../runtime/content/hash.js'
import { getInlineDocs } from '../../runtime/content/inline.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('configured Markdown rendering', () => {
  it('preserves a replacement parser, nested fences, custom rules and one parse per document', async () => {
    const project = await createMarkdownProject()
    let hooks = 0
    let parses = 0
    project.ctx.config.markdown = (original) => {
      hooks++
      const replacement = new MarkdownIt({ highlight: original.options.highlight })
      replacement.core.ruler.push('extra-fence', (state) => {
        parses++
        const fence = new state.Token('fence', 'code', 0)
        fence.info = 'js extra-info'
        fence.content = 'const nested = "<tag>"'
        const parent = new state.Token('inline', '', 0)
        parent.children = [fence]
        state.tokens.push(parent)
      })
      replacement.renderer.rules.paragraph_open = () => '<section>'
      replacement.renderer.rules.paragraph_close = () => '</section>'
      return replacement
    }
    try {
      const md = await createMarkdownRendererWithPlugins(project.ctx)
      const html = await renderMarkdown(project.ctx, md, 'Custom content')
      expect(html).toContain('<section>Custom content</section>')
      expect(html).toContain('nested')
      const document = new JSDOM(html).window.document
      expect(document.querySelector('code').textContent).toContain('const nested = "<tag>"')
      expect(document.querySelector('tag')).toBeNull()
      expect(hooks).toBe(1)
      expect(parses).toBe(1)
    }
    finally { await project.close() }
  })

  it('calls a whole render replacement once and preserves its injected syntax fence', async () => {
    const project = await createMarkdownProject()
    let renders = 0
    project.ctx.config.markdown = (md) => {
      const render = md.render.bind(md)
      md.render = (source, env) => {
        renders++
        return render(`${source}\n\n\`\`\`ruby\nputs "injected"\n\`\`\``, env)
      }
    }
    try {
      const md = await createMarkdownRendererWithPlugins(project.ctx)
      const html = await renderMarkdown(project.ctx, md, 'Original')
      expect(html).toContain('Original')
      expect(html).toContain('injected')
      expect(renders).toBe(1)
    }
    finally { await project.close() }
  })
  it('does not capture inline docs against source edited during asynchronous rendering', async () => {
    const project = await createMarkdownProject()
    const before = '<docs lang="md"># Before</docs>'
    const after = '<docs lang="md"># After</docs>'
    const file = await project.write(before, 'Inline.story.vue')
    project.ctx.storyFiles.push(file)
    project.ctx.config.markdown = (md) => {
      md.core.ruler.push('edit-source-during-render', () => writeFileSync(file.path, after))
    }
    try {
      const plugins = await createMarkdownPlugins(project.ctx)
      const transform = plugins[0].transform as (code: string, id: string) => Promise<string>
      expect(await transform('# Before', `${file.path}?vue&type=docs&lang.md`)).toContain('Before')
      expect(getInlineDocs(project.ctx, file.path, hashContent(before))).toBeUndefined()
      expect(getInlineDocs(project.ctx, file.path, hashContent(after))).toBeUndefined()
    }
    finally { await project.close() }
  })
})

import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../markdown/render.js'
import { createMarkdownRenderer } from '../../markdown/renderer.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('documentation code blocks', () => {
  it('renders one preformatted block and keeps language label outside copied source', async () => {
    const project = await createMarkdownProject()
    const source = 'const tag: string = "<button>"\n\nconsole.log(tag)\n'
    try {
      const renderer = await createMarkdownRenderer(project.ctx)
      const html = await renderMarkdown(project.ctx, renderer, `\`\`\`ts\n${source}\`\`\``)
      const document = new JSDOM(html).window.document
      expect(document.querySelectorAll('pre')).toHaveLength(1)
      expect(document.querySelector('pre > code')?.textContent).toBe(source)
      expect(document.querySelector('pre > code span')).not.toBeNull()
      expect(document.querySelector('button')).toBeNull()
      expect(document.querySelector('pre')?.previousElementSibling?.textContent).toBe('ts')
    }
    finally { await project.close() }
  })
})

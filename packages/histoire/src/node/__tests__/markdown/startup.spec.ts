import { JSDOM } from 'jsdom'
import * as shiki from 'shiki'
import { describe, expect, it, vi } from 'vitest'
import { closeContext } from '../../context.js'
import { renderMarkdown } from '../../markdown/render.js'
import { createMarkdownPlugins, createMarkdownRenderer, createMarkdownRendererWithPlugins } from '../../markdown/renderer.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

// Observe the real Shiki factory; no syntax-engine behavior is substituted.
vi.mock('shiki', { spy: true })

describe('markdown startup work', () => {
  it('creates all dev Markdown consumers without initializing a syntax engine for prose', async () => {
    const project = await createMarkdownProject()
    const initialization = vi.spyOn(shiki, 'createHighlighter')
    try {
      const renderer = await createMarkdownRenderer(project.ctx)
      expect(initialization).not.toHaveBeenCalled()
      const configured = await createMarkdownRendererWithPlugins(project.ctx)
      const plugins = await createMarkdownPlugins(project.ctx)
      expect(renderer.render('First document')).toContain('First document')
      expect(configured.render('Second document')).toContain('Second document')
      const transform = plugins[0].transform as (code: string, id: string) => Promise<string>
      expect(await transform('# Inline document', `${project.ctx.root}/missing.vue?vue&type=docs&lang.md`)).toContain('Inline document')
      // This protects boot cost, alongside real output from every consumer.
      expect(initialization).not.toHaveBeenCalled()
    }
    finally {
      await project.close()
      initialization.mockRestore()
    }
  })

  it('shares one engine across consumers, deduplicates aliases and loads embedded Vue grammars', async () => {
    const project = await createMarkdownProject()
    const initialization = vi.spyOn(shiki, 'createHighlighter')
    try {
      const one = await createMarkdownRenderer(project.ctx)
      const two = await createMarkdownRenderer(project.ctx)
      await renderMarkdown(project.ctx, one, '```text\nplain\n```')
      const engine = await initialization.mock.results[0].value
      const loads = vi.spyOn(engine, 'loadLanguage')
      const html = await Promise.all([
        renderMarkdown(project.ctx, one, '```ts\nconst count: number = 1\n```'),
        renderMarkdown(project.ctx, two, '```typescript\nconst safe = "<script>"\n```'),
        renderMarkdown(project.ctx, one, '```vue\n<template><button>{{ count }}</button></template>\n<script setup lang="ts">const count = 1</script>\n```'),
      ])
      expect(initialization).toHaveBeenCalledOnce()
      expect(initialization.mock.calls[0][0].langs).toEqual([])
      expect(loads.mock.calls.filter(([language]) => language === 'typescript')).toHaveLength(1)
      expect(engine.getLoadedLanguages()).toEqual(expect.arrayContaining(['typescript', 'vue']))
      expect(engine.getLoadedLanguages()).not.toContain('python')
      expect(html[0]).toContain('count')
      const document = new JSDOM(html[1]).window.document
      expect(document.querySelector('code').textContent).toContain('const safe = "<script>"')
      expect(document.querySelector('script')).toBeNull()
      expect(html[2]).toContain('button')
      loads.mockRestore()
    }
    finally {
      await project.close()
      initialization.mockRestore()
    }
  })

  it('disposes an engine acquired during shutdown and leaves another context usable', async () => {
    const first = await createMarkdownProject()
    const second = await createMarkdownProject()
    const initialization = vi.spyOn(shiki, 'createHighlighter')
    try {
      const renderer = await createMarkdownRenderer(first.ctx)
      const rendering = renderMarkdown(first.ctx, renderer, '```js\nconst closed = true\n```')
      const rejection = expect(rendering).rejects.toThrow('Project runtime closed')
      const closing = closeContext(first.ctx)
      const engine = await initialization.mock.results[0].value
      const disposal = vi.spyOn(engine, 'dispose')
      await rejection
      await closing
      await closeContext(first.ctx)
      expect(disposal).toHaveBeenCalledOnce()
      await expect(renderMarkdown(first.ctx, renderer, 'closed')).rejects.toThrow('Project runtime closed')
      const other = await createMarkdownRenderer(second.ctx)
      expect(await renderMarkdown(second.ctx, other, '```js\nconst alive = true\n```')).toContain('alive')
      expect(initialization).toHaveBeenCalledTimes(2)
      disposal.mockRestore()
    }
    finally {
      await first.close()
      await second.close()
      initialization.mockRestore()
    }
  })
})

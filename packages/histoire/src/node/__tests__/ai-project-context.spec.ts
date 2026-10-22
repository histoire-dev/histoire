import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { aiProjectContext } from '../ai-threads/project-context.js'

/** Minimal dev context with the given story files. */
function context(files: { relativePath: string, fileOrigin?: string }[], config: Record<string, unknown> = {}): Context {
  return {
    root: '/project',
    config: { storyMatch: ['**/*.story.vue'], plugins: [{ name: 'builtin:vanilla-support' }, { name: '@histoire/plugin-vue' }], ...config },
    storyFiles: files,
  } as unknown as Context
}

describe('aI thread project context', () => {
  it('describes story conventions with project examples of the dominant extension', () => {
    const value = aiProjectContext(context([
      { relativePath: 'src/A.story.vue' },
      { relativePath: 'src/B.story.vue' },
      { relativePath: 'src/C.story.js' },
      { relativePath: 'src/D.story.vue' },
      { relativePath: 'src/E.story.vue' },
      { relativePath: 'Tailwind.story.js', fileOrigin: 'generated' },
    ], { setupFile: { browser: '/project/src/histoire-setup.ts' } }))
    expect(value).toEqual({
      storyMatch: ['**/*.story.vue'],
      plugins: ['builtin:vanilla-support', '@histoire/plugin-vue'],
      setupFiles: ['src/histoire-setup.ts'],
      stories: 5,
      examples: ['src/A.story.vue', 'src/B.story.vue', 'src/D.story.vue'],
    })
  })

  it('reads Vite root-relative setup files and never reports files outside the project', () => {
    expect(aiProjectContext(context([], { setupFile: '/src/setup.ts' })).setupFiles).toEqual(['src/setup.ts'])
    expect(aiProjectContext(context([], { setupFile: '../outside/setup.ts' })).setupFiles).toEqual([])
  })
})

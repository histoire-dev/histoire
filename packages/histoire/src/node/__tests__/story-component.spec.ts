import type { StoryFile } from '../../../../histoire-app/src/app/types'
import { expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { resolveStoryFileComponent } from '../../../../histoire-app/src/app/util/story-component'

it('resolves explicit story loaders once without invoking function components', async () => {
  const component = vi.fn(() => ({ type: 'Story' }))
  const load = vi.fn(async () => ({ default: component }))
  const file = reactive({ component: { __asyncLoader: load } }) as unknown as StoryFile
  expect(await resolveStoryFileComponent(file)).toBe(component)
  expect(await resolveStoryFileComponent(file)).toBe(component)
  expect(load).toHaveBeenCalledOnce()
  expect(component).not.toHaveBeenCalled()
})

it('retains directly imported function components without executing them', async () => {
  const component = vi.fn(() => {
    throw new Error('Hooks require React root')
  })
  const file = { component } as unknown as StoryFile
  expect(await resolveStoryFileComponent(file)).toBe(component)
  expect(component).not.toHaveBeenCalled()
})

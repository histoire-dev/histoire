import { describe, expect, it } from 'vitest'
import { createdStories } from '../../../histoire-app/src/app/components/panes/ai/created-stories.js'

const stories = [
  { id: 'meow', title: 'Meow', relativePath: 'src/components/Meow.story.vue' },
  { id: 'button', title: 'Button', relativePath: 'src/components/Button.story.vue' },
]

describe('aI thread created stories', () => {
  it('links changed files that are collected stories, once each, in change order', () => {
    const changes = [
      { file: 'src/components/Button.story.vue', added: 20, removed: 0 },
      { file: 'src/components/Button.vue', added: 2, removed: 1 },
      { file: './src/components/Meow.story.vue', added: 30, removed: 0 },
      { file: 'src/components/Button.story.vue', added: 1, removed: 0 },
    ]
    expect(createdStories(changes, stories).map(story => story.id)).toEqual(['button', 'meow'])
  })

  it('ignores files not collected yet', () => {
    expect(createdStories([{ file: 'src/New.story.vue', added: 10, removed: 0 }], stories)).toEqual([])
  })
})

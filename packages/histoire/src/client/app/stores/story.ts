import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { router } from '../router'
import { Story } from '../types'

export const useStoryStore = defineStore('story', () => {
  const stories = ref<Story[]>([])

  function addStory (story: Story) {
    const existing = stories.value.find(s => s.id === story.id)
    if (existing) {
      Object.assign(existing, story)
      return existing
    }
    stories.value.push(story)
    return story
  }

  function removeStory (story: Story) {
    const index = stories.value.findIndex(s => s.id === story.id)
    if (index !== -1) {
      stories.value.splice(index, 1)
    }
  }

  const currentStory = computed(() => stories.value.find(s => s.id === router.currentRoute.value.params.storyId))

  return {
    stories,
    addStory,
    removeStory,
    currentStory,
  }
})

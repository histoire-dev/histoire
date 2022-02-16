import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { router } from '../router'
import { Story } from '../types'

export const useStoryStore = defineStore('story', () => {
  const theme = ref({
    title: 'Histoire',
  })

  const stories = ref<Story[]>([])
  function setStories (value: Story[]) {
    stories.value = value
  }

  const currentStory = computed(() => stories.value.find(s => s.id === router.currentRoute.value.params.storyId))

  const currentVariant = computed(() => currentStory.value?.variants.find(v => v.id === router.currentRoute.value.query.variantId))

  return {
    theme,
    stories,
    setStories,
    currentStory,
    currentVariant,
  }
})

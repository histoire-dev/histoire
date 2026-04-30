import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export type StoryOptionsPlacement = 'right' | 'bottom'

export interface LayoutSettings {
  storyListVisible: boolean
  storyOptionsVisible: boolean
  storyOptionsPlacement: StoryOptionsPlacement
}

export const useLayoutStore = defineStore('layout', () => {
  const settings = useStorage<LayoutSettings>('_histoire-layout-v1', {
    storyListVisible: true,
    storyOptionsVisible: true,
    storyOptionsPlacement: 'right',
  })

  function toggleStoryList() {
    settings.value.storyListVisible = !settings.value.storyListVisible
  }

  function toggleStoryOptions() {
    settings.value.storyOptionsVisible = !settings.value.storyOptionsVisible
  }

  function setStoryOptionsPlacement(value: StoryOptionsPlacement) {
    settings.value.storyOptionsPlacement = value
  }

  return {
    settings,
    toggleStoryList,
    toggleStoryOptions,
    setStoryOptionsPlacement,
  }
})

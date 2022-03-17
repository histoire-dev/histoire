import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { router } from '../router'
import { Story } from '../types'
import { useStorage } from '@vueuse/core'

export const useStoryStore = defineStore('story', () => {
  const stories = ref<Story[]>([])
  function setStories (value: Story[]) {
    stories.value = value
  }

  const currentStory = computed(() => stories.value.find(s => s.id === router.currentRoute.value.params.storyId))

  const currentVariant = computed(() => currentStory.value?.variants.find(v => v.id === router.currentRoute.value.query.variantId))

  const openedFolders = useStorage<Map<string, boolean>>(
    '_histoire-tree-state',
    new Map(),
  )

  function getStringPath (path: Array<string>) {
    return path.join('␜')
  }

  function toggleFolder (path: Array<string>, force?: boolean) {
    const stringPath = getStringPath(path)

    if (force === undefined) {
      force = !openedFolders.value.get(stringPath)
    }

    if (force) {
      openedFolders.value.set(stringPath, true)
    } else {
      openedFolders.value.delete(stringPath)
    }
  }

  function isFolderOpened (path: Array<string>) {
    return openedFolders.value.get(getStringPath(path))
  }

  function openFileFolders (path: Array<string>) {
    for (let pathLength = 1; pathLength < path.length; pathLength++) {
      toggleFolder(path.slice(0, pathLength), true)
    }
  }

  watch(currentStory, () => {
    openFileFolders(currentStory.value.file.path)
  })

  return {
    stories,
    setStories,
    currentStory,
    currentVariant,
    isFolderOpened,
    toggleFolder,
  }
})

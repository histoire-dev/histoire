import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { router } from '../router'
import { Story } from '../types'

export const useStoryStore = defineStore('story', () => {
  const stories = ref<Story[]>([])
  function setStories (value: Story[]) {
    stories.value = value
  }

  const currentStory = computed(() => stories.value.find(s => s.id === router.currentRoute.value.params.storyId))

  const currentVariant = computed(() => currentStory.value?.variants.find(v => v.id === router.currentRoute.value.query.variantId))

  const openedFolders = reactive({} as Record<string, boolean>)

  function getStringPath (path: Array<string>) {
    return path.join('␜')
  }

  function toggleFolder (path: Array<string>, force?: boolean) {
    const stringPath = getStringPath(path)

    if (force === undefined) {
      force = !openedFolders[stringPath]
    }

    if (force) {
      openedFolders[stringPath] = true
    } else {
      delete openedFolders[stringPath]
    }
  }

  function isFolderOpened (path: Array<string>) {
    return openedFolders[getStringPath(path)]
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

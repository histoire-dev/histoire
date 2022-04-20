import { defineStore } from 'pinia'
import { watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useStoryStore } from './story'

export const useFolderStore = defineStore('folder', () => {
  const openedFolders = useStorage<Map<string, boolean>>(
    '_histoire-tree-state',
    new Map(),
  )

  function getStringPath (path: Array<string>) {
    return path.join('␜')
  }

  function toggleFolder (path: Array<string>, defaultToggleValue = true) {
    const stringPath = getStringPath(path)

    const currentValue = openedFolders.value.get(stringPath)

    if (currentValue == null) {
      openedFolders.value.set(stringPath, defaultToggleValue)
    } else if (currentValue) {
      openedFolders.value.set(stringPath, false)
    } else {
      openedFolders.value.set(stringPath, true)
    }
  }

  function isFolderOpened (path: Array<string>, defaultValue = false) {
    const value = openedFolders.value.get(getStringPath(path))
    if (value == null) {
      return defaultValue
    }
    return value
  }

  function openFileFolders (path: Array<string>) {
    for (let pathLength = 1; pathLength < path.length; pathLength++) {
      toggleFolder(path.slice(0, pathLength), true)
    }
  }

  const storyStore = useStoryStore()

  watch(() => storyStore.currentStory, (story) => {
    openFileFolders(story.file.path)
  })

  return {
    isFolderOpened,
    toggleFolder,
  }
})

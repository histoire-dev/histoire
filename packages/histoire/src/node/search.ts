import type { Context } from './context.js'
import { noCase } from 'change-case'

export async function generateTitleSearchData(ctx: Context) {
  const searchIndex = []
  const { idMap, addToIdMap } = createIdMap()

  for (const storyFile of ctx.storyFiles) {
    if (storyFile.story) {
      searchIndex.push({
        id: addToIdMap(storyFile.story.id, 'story'),
        text: convertTitleToSentence(storyFile.story.title),
      })
      for (const variant of storyFile.story.variants) {
        searchIndex.push({
          id: addToIdMap(`${storyFile.story.id}:${variant.id}`, 'variant'),
          text: convertTitleToSentence(`${storyFile.story.title} ${variant.title}`),
        })
      }
    }
  }

  return {
    index: searchIndex,
    idMap,
  }
}

export async function generateDocSearchData(ctx: Context) {
  const searchIndex = []
  const { idMap, addToIdMap } = createIdMap()

  for (const storyFile of ctx.storyFiles) {
    if (storyFile.story && storyFile.story.docsText) {
      searchIndex.push({
        id: addToIdMap(storyFile.story.id, 'story'),
        text: storyFile.story.docsText,
      })
    }
  }

  return {
    index: searchIndex,
    idMap,
  }
}

function createIdMap() {
  let uid = 0
  const idMap: Record<number, { id: string, kind: string }> = {}

  function addToIdMap(id: string, kind: string) {
    const n = uid++
    idMap[n] = { id, kind }
    return n
  }

  return {
    idMap,
    addToIdMap,
  }
}

function convertTitleToSentence(text: string) {
  return text.split(' ').map(str => noCase(str)).join(' ')
}

// @TODO clear handlers when SearchPane unmounts
export function getSearchDataJS(data: any) {
  return `export let searchData = ${JSON.stringify(data)}
const handlers = []
export function onUpdate (cb) {
  handlers.push(cb)
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    searchData = newModule.searchData
    handlers.forEach(h => {
      h(newModule.searchData)
      newModule.onUpdate(h)
    })
  })
}`
}

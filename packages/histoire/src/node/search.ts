import { createRequire } from 'module'
import flexsearch from 'flexsearch'
import path from 'pathe'
import Case from 'case'
import { Context } from './context.js'
import { loadModule } from './load.js'

const require = createRequire(import.meta.url)

export async function generateSearchData (ctx: Context) {
  let uid = 0
  const idMap: Record<number, { id: string, kind: string }> = {}
  const flexsearchRoot = path.dirname(require.resolve('flexsearch/package.json'))
  const searchIndex = new flexsearch.Document({
    preset: 'memory',
    document: {
      id: 'id',
      index: [
        'title',
        'docs',
      ],
    },
    charset: await loadModule(`${flexsearchRoot}/dist/module/lang/latin/advanced.js`),
    language: await loadModule(`${flexsearchRoot}/dist/module/lang/en.js`),
    tokenize: 'forward',
  })

  function addToIdMap (id: string, kind: string) {
    const n = uid++
    idMap[n] = { id, kind }
    return n
  }

  for (const storyFile of ctx.storyFiles) {
    if (storyFile.story) {
      searchIndex.add({
        id: addToIdMap(storyFile.story.id, 'story'),
        title: processTitle(storyFile.story.title),
        docs: '', // @TODO
      })
      for (const variant of storyFile.story.variants) {
        searchIndex.add({
          id: addToIdMap(`${storyFile.story.id}:${variant.id}`, 'variant'),
          title: processTitle(`${storyFile.story.title} ${variant.title}`),
          docs: '', // @TODO
        })
      }
    }
  }

  return {
    index: await exportSearchIndex(searchIndex),
    idMap,
  }
}

const exportKeys = new Set([
  'reg',
  'title.cfg',
  'title.map',
  'title.ctx',
  'docs.cfg',
  'docs.map',
  'docs.ctx',
  'tag',
  'store',
])

async function exportSearchIndex (index) {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    const exportedData: Record<string, any> = {}
    const exportedKeys = new Set<string>()
    await index.export((key, data) => {
      exportedData[key] = data
      exportedKeys.add(key)
      if (exportedKeys.size === exportKeys.size) {
        resolve(exportedData)
      }
    })
  })
}

function processTitle (title: string) {
  return title.split(' ').map(str => Case.lower(str)).join(' ')
}

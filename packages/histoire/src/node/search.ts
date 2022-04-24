import { createRequire } from 'module'
import flexsearch from 'flexsearch'
import path from 'pathe'
import { Context } from './context.js'
import { loadModule } from './load.js'

const require = createRequire(import.meta.url)

export async function generateSearchData (ctx: Context) {
  const flexsearchRoot = path.dirname(require.resolve('flexsearch/package.json'))
  const searchIndex = new flexsearch.Document({
    preset: 'match',
    document: {
      id: 'id',
      index: [
        'title',
        'docs',
      ],
      store: [
        'kind',
      ],
    },
    charset: await loadModule(`${flexsearchRoot}/dist/module/lang/latin/advanced.js`),
    language: await loadModule(`${flexsearchRoot}/dist/module/lang/en.js`),
    tokenize: 'full',
  })

  for (const storyFile of ctx.storyFiles) {
    if (storyFile.story) {
      searchIndex.add({
        id: storyFile.story.id,
        kind: 'story',
        title: storyFile.story.title,
        docs: '', // @TODO
      })
      for (const variant of storyFile.story.variants) {
        searchIndex.add({
          id: `${storyFile.story.id}:${variant.id}`,
          kind: 'variant',
          title: `${storyFile.story.title} ${variant.title}`,
          docs: '', // @TODO
        })
      }
    }
  }

  return exportSearchIndex(searchIndex)
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

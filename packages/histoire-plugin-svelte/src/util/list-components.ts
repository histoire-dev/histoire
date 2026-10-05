import { globby } from 'globby'

/** Lists components from a captured project; legacy direct callers keep cwd default. */
export async function listComponentFiles(search = '', ignore: string[] = [], limit = 10, root = process.cwd()) {
  let files = await globby('**/*.svelte', {
    cwd: root,
    gitignore: true,
    ignore: [
      'node_modules',
      ...ignore,
    ],
  })
  if (search) {
    const searchText = search.toLowerCase()
    files = files.filter(file => file.toLowerCase().includes(searchText))
  }
  return files.slice(0, limit)
}

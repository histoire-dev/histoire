import { HistoireConfig } from './config.js'

export type TreeFile = {
  title: string
  path: string
}

export type TreeLeaf = {
  title: string
  index: number
}

export type TreeFolder = {
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export type TTree = (TreeFolder | TreeLeaf)[]

export function createPath (config: HistoireConfig, file: TreeFile) {
  if (config.tree.file === 'title') {
    return file.title.split('/')
  }

  if (config.tree.file === 'path') {
    const path = file.path.split('/')
    path.pop()
    path.push(file.title)
    return path
  }

  return config.tree.file(file)
}

export function makeTree (config: HistoireConfig, files: { path: string[], index: number }[]) {
  interface ITreeObject {
    [index: string]: number | ITreeObject
  }

  const treeObject: ITreeObject = {}

  for (const file of files) {
    setPath(file.path, file.index, treeObject)
  }

  let sortingFunction = (a: string, b: string) => a.localeCompare(b)

  if (config.tree.order !== 'asc') {
    sortingFunction = config.tree.order
  }

  return buildTree(treeObject)

  // Undefined behavior for folder and file that share the same name under the same directory
  function setPath (path: string[], value: unknown, tree: unknown) {
    path.reduce((subtree, key, i) => {
      if (!subtree[key]) {
        subtree[key] = {}
      }
      if (i === path.length - 1) {
        subtree[key] = value
      }
      return subtree[key]
    }, tree)
  }

  function buildTree (treeObject: ITreeObject): TTree {
    const tree: TTree = []

    for (const [key, element] of Object.entries(treeObject)) {
      if (Number.isInteger(element)) {
        tree.push({
          title: key,
          index: element as number,
        })
      } else {
        tree.push({
          title: key,
          children: buildTree(element as ITreeObject),
        })
      }
    }

    tree.sort((a, b) => sortingFunction(a.title, b.title))

    return tree
  }
}

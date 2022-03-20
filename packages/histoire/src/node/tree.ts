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

export type Tree = (TreeFolder | TreeLeaf)[]

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

  function setPath (path: string[], value: unknown, tree: unknown) {
    path.reduce((subtree, key, i) => {
      if (i === path.length - 1) {
        setKey(subtree, key, value)
      } else if (isLeaf(subtree[key])) {
        setKey(subtree, key, subtree[key])
        subtree[key] = {}
      } else if (!subtree[key]) {
        subtree[key] = {}
      }
      return subtree[key]
    }, tree)

    function isLeaf (element) {
      return !isNaN(element)
    }
  }

  function setKey (tree, key, value) {
    if (isUndefined(tree[key])) {
      tree[key] = value
      return
    }

    let copyNumber = 1

    while (!isUndefined(tree[`${key}-${copyNumber}`])) {
      copyNumber++
    }

    tree[`${key}-${copyNumber}`] = value

    function isUndefined (element) {
      return element === undefined
    }
  }

  function buildTree (treeObject: ITreeObject): Tree {
    const tree: Tree = []

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

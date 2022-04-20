import pc from 'picocolors'
import type { HistoireConfig, TreeGroupConfig } from './config.js'
import type { StoryFile } from './types.js'

export interface TreeFile {
  title: string
  path: string
}

export interface TreeLeaf {
  title: string
  index: number
}

export interface TreeFolder {
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export interface TreeGroup {
  group: true
  id: string
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export type Tree = (TreeGroup | TreeFolder | TreeLeaf)[]

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

export function makeTree (config: HistoireConfig, files: StoryFile[]) {
  interface ITreeObject {
    [index: string]: number | ITreeObject
  }

  interface ITreeGroup {
    groupConfig?: TreeGroupConfig
    treeObject: ITreeObject
  }

  const groups: ITreeGroup[] = config.tree?.groups?.map(g => ({
    groupConfig: g,
    treeObject: {},
  })) || []
  const defaultGroup = {
    treeObject: {},
  }
  groups.push(defaultGroup)

  files.forEach((file, index) => {
    const group = getGroup(file)
    setPath(file.treePath, index, group.treeObject)
  })

  let sortingFunction = (a: string, b: string) => a.localeCompare(b)

  if (config.tree.order !== 'asc') {
    sortingFunction = config.tree.order
  }

  const result: Tree = []

  for (const group of groups) {
    if (group === defaultGroup) {
      result.push(...buildTree(group.treeObject))
    } else {
      result.push({
        group: true,
        id: group.groupConfig.id,
        title: group.groupConfig.title,
        children: buildTree(group.treeObject),
      })
    }
  }

  return result

  function getGroup (file: StoryFile): ITreeGroup {
    if (file.story?.group) {
      const group = groups.find(g => g.groupConfig?.id === file.story.group)
      if (group) {
        return group
      } else {
        console.error(pc.red(`Group ${file.story.group} not found for story ${file.path}`))
      }
    }
    for (const group of groups) {
      if (group.groupConfig?.include && group.groupConfig.include(file.treeFile)) {
        return group
      }
    }
    return defaultGroup
  }

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

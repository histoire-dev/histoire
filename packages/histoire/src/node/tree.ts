import type {
  HistoireConfig,
  ServerStoryFile,
  ServerTree,
  ServerTreeFile,
  TreeGroupConfig,
} from '@histoire/shared'
import pc from 'picocolors'

export function createPath(config: HistoireConfig, file: ServerTreeFile) {
  if (!config.tree.file || config.tree.file === 'title') {
    return file.title.split('/')
  }

  if (config.tree.file === 'path') {
    const paths = file.path.split('/').slice(0, -1)

    // check if tree file path is a plugin
    const index = paths.findIndex(p => p.includes('.histoire'))

    if (index !== -1) {
      return ['plugins', file.title]
    }

    return [...paths, file.title]
  }

  return config.tree.file(file)
}

export function makeTree(config: HistoireConfig, files: ServerStoryFile[]) {
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
    if (!file.treePath) {
      return
    }
    const group = getGroup(file)
    setPath(file.treePath, index, group.treeObject)
  })

  let sortingFunction = (a: string, b: string) => a.localeCompare(b)

  if (typeof config.tree.order === 'function') {
    sortingFunction = config.tree.order
  }

  const result: ServerTree = []

  for (const group of groups) {
    if (group === defaultGroup) {
      result.push(...buildTree(group.treeObject))
    }
    else {
      if (group.groupConfig) {
        result.push({
          group: true,
          id: group.groupConfig.id ?? group.groupConfig.title,
          title: group.groupConfig.title,
          children: buildTree(group.treeObject),
        })
      }
    }
  }

  return result

  function getGroup(file: ServerStoryFile): ITreeGroup {
    if (file.story?.group) {
      const group = groups.find(g => g.groupConfig?.id === file.story!.group)
      if (group) {
        return group
      }
      else {
        console.error(pc.red(`Group ${file.story.group} not found for story ${file.path}`))
      }
    }
    for (const group of groups) {
      if (group.groupConfig?.include && file.treeFile && group.groupConfig.include(file.treeFile)) {
        return group
      }
    }
    return defaultGroup
  }

  function setPath(path: string[], value: number, tree: ITreeObject) {
    path.reduce<ITreeObject>((subtree, key, i) => {
      if (i === path.length - 1) {
        setKey(subtree, key, value)
        return subtree
      }
      else if (isLeaf(subtree[key])) {
        setKey(subtree, key, subtree[key])
        subtree[key] = {}
      }
      else if (!subtree[key]) {
        subtree[key] = {}
      }
      return subtree[key] as ITreeObject
    }, tree)

    function isLeaf(element: unknown) {
      return !Number.isNaN(Number(element))
    }
  }

  function setKey(tree: ITreeObject, key: string, value: number | ITreeObject) {
    if (isUndefined(tree[key])) {
      tree[key] = value
      return
    }

    let copyNumber = 1

    while (!isUndefined(tree[`${key}-${copyNumber}`])) {
      copyNumber++
    }

    tree[`${key}-${copyNumber}`] = value

    function isUndefined(element: unknown) {
      return element === undefined
    }
  }

  function buildTree(treeObject: ITreeObject): ServerTree {
    const tree: ServerTree = []

    for (const [key, element] of Object.entries(treeObject)) {
      if (Number.isInteger(element)) {
        tree.push({
          title: key,
          index: element as number,
        })
      }
      else {
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

import { describe, test, expect } from '@peeky/test'
import { makeTree } from './tree'
import { getDefaultConfig } from './config'
import type { StoryFile } from './types'

let id = 0

interface StoryFileFactoryOptions {
  treePath: string[]
}

function storyFileFactory (options: StoryFileFactoryOptions): StoryFile {
  return {
    id: `id_${id++}`,
    path: options.treePath.join('/'),
    treePath: options.treePath,
    fileName: 'fileName',
    moduleId: 'moduleId',
  }
}

describe('makeTree', () => {
  test('should create an ascending ordered tree', () => {
    const config = getDefaultConfig()
    const files = [
      { treePath: ['hi'] },
      { treePath: ['hey'] },
      { treePath: ['hello', 'world'] },
      { treePath: ['hello', 'mom'] },
    ]

    const tree = makeTree(config, files.map(storyFileFactory))

    expect(tree).toEqual([
      {
        title: 'hello',
        children: [
          { title: 'mom', index: 3 },
          { title: 'world', index: 2 },
        ],
      },
      { title: 'hey', index: 1 },
      { title: 'hi', index: 0 },
    ])
  })

  test('should handle title conflict', () => {
    const config = getDefaultConfig()
    const files = [
      { treePath: ['hi'] },
      { treePath: ['hi'] },
      { treePath: ['hi'] },
    ]

    const tree = makeTree(config, files.map(storyFileFactory))

    expect(tree).toEqual([
      { title: 'hi', index: 0 },
      { title: 'hi-1', index: 1 },
      { title: 'hi-2', index: 2 },
    ])
  })

  test('should handle file-folder conflict when folder in first', () => {
    const config = getDefaultConfig()
    const files = [
      { treePath: ['hi', 'dad'] },
      { treePath: ['hi'] },
      { treePath: ['hi', 'mom'] },
    ]

    const tree = makeTree(config, files.map(storyFileFactory))

    expect(tree).toEqual([
      {
        title: 'hi',
        children: [
          { title: 'dad', index: 0 },
          { title: 'mom', index: 2 },
        ],
      },
      { title: 'hi-1', index: 1 },
    ])
  })

  test('should handle file-folder conflict when file in first', () => {
    const config = getDefaultConfig()
    const files = [
      { treePath: ['hi'] },
      { treePath: ['hi', 'dad'] },
      { treePath: ['hi', 'mom'] },
    ]

    const tree = makeTree(config, files.map(storyFileFactory))

    expect(tree).toEqual([
      {
        title: 'hi',
        children: [
          { title: 'dad', index: 1 },
          { title: 'mom', index: 2 },
        ],
      },
      { title: 'hi-1', index: 0 },
    ])
  })
})

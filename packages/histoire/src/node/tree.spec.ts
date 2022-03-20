import { makeTree } from './tree'
import { getDefaultConfig } from './config'

describe('makeTree', () => {
  test('should create an ascending ordered tree', () => {
    const config = getDefaultConfig()
    const files = [
      { index: 0, path: ['hi'] },
      { index: 1, path: ['hey'] },
      { index: 2, path: ['hello', 'world'] },
      { index: 3, path: ['hello', 'mom'] },
    ]

    const tree = makeTree(config, files)

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
      { index: 0, path: ['hi'] },
      { index: 1, path: ['hi'] },
      { index: 2, path: ['hi'] },
    ]

    const tree = makeTree(config, files)

    expect(tree).toEqual([
      { title: 'hi', index: 0 },
      { title: 'hi-1', index: 1 },
      { title: 'hi-2', index: 2 },
    ])
  })

  test('should handle file-folder conflict when folder in first', () => {
    const config = getDefaultConfig()
    const files = [
      { index: 0, path: ['hi', 'dad'] },
      { index: 1, path: ['hi'] },
      { index: 2, path: ['hi', 'mom'] },
    ]

    const tree = makeTree(config, files)

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
      { index: 0, path: ['hi'] },
      { index: 1, path: ['hi', 'dad'] },
      { index: 2, path: ['hi', 'mom'] },
    ]

    const tree = makeTree(config, files)

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

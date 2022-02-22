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
})

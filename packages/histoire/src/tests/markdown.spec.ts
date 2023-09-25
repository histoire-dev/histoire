import { describe, test, expect } from 'vitest'
import { createMarkdownFilesWatcher } from '../node/markdown'
import { watchStories } from '../node/stories'
import { createContext } from '../node/context.js'
import { createWriteStream, unlinkSync } from 'fs'

describe('markdown', async () => {
  const ctx = await createContext({
    mode: 'dev',
  })
  // create watch stories to set context root etc.
  await watchStories(ctx)

  test('should not throw error or depend on - resolve order for linking', async () => {
    // FileWatcher should pickup the test markdown files (test1 and test2)
    // test1 links to test2 (issue previously as test1 resolved first)
    // test 2 links to test1
    await createMarkdownFilesWatcher(ctx)
    expect(ctx.markdownFiles.length).toEqual(2)
  })

  test('should render html from md', async () => {
    await createMarkdownFilesWatcher(ctx)
    expect(ctx.markdownFiles[0].html).toContain('<p>')
  })

  test('should throw error on missing [md] story file.', async () => {
    const testFile3 = '/resources/test3.story.md'
    const writer = createWriteStream(__dirname.concat(testFile3))
    // link to missing file.
    writer.write(
      '<!-- File should link to test1 file. -->\n' +
      '# Test3\n\n' +
      'Link to test 4\n' +
      '[TEST](./test4.story.md)\n')
    writer.end()
    await new Promise(resolve => writer.on('finish', resolve))

    // create markdownWatcher and check for error
    await expect(async () => createMarkdownFilesWatcher(ctx)).rejects.toThrowError()
    // delete test file, so failures are removed as well.
    unlinkSync(__dirname.concat(testFile3))
  })
})

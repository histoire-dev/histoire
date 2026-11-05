import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { configFileHash } from '../../config/codemod/write.js'
import { safeConfigWrite } from '../../config/safe-config-write.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'

afterEach(disposeConfigProjects)

it.each([false, true])('restores post-write load failure without overwriting concurrent config, concurrent %s', async (concurrent) => {
  const original = 'export default { plugins: [] }\r\n'
  const newer = 'export default { plugins: [], theme: { title: "Concurrent" } }\n'
  const fixture = await configTestProject(original)
  await writeFile(`${fixture.root}/plugins.cjs`, `exports.TestPlugin = (file) => {
    if (file.includes('.histoire-config-check-')) return { name: 'test-plugin' }
    ${concurrent ? `require('node:fs').writeFileSync(require('node:url').fileURLToPath(file), ${JSON.stringify(newer)})` : ''}
    throw new Error('committed config cannot load')
  }`)
  const operation = safeConfigWrite({
    root: fixture.root,
    file: fixture.file,
    code: 'import { TestPlugin } from "./plugins.cjs"\nexport default { plugins: [TestPlugin(import.meta.url)] }\n',
    expectedHash: (await configFileHash(fixture.file, { root: fixture.root }))!,
    expectedNames: ['test-plugin'],
    isActive: () => true,
  })
  await expect(operation).rejects.toMatchObject({ restored: !concurrent })
  expect(await readFile(fixture.file, 'utf8')).toBe(concurrent ? newer : original)
})

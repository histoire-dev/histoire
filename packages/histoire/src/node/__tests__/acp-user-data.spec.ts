import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentOutputFilter, readAgentUserData, updateAgentUserData } from '../acp/user-data.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('private ACP user data', () => {
  it('serializes concurrent writes without dropping env keys or another project', async () => {
    const { root } = await configTestProject()
    const file = join(root, 'private/agents.json')
    const settings = { enabled: false, enabledIds: [], presets: [], permissions: {}, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } }
    await Promise.all([
      updateAgentUserData(file, root, settings, { id: 'fake', value: { FIRST: 'first-private' } }),
      updateAgentUserData(file, `${root}/second`, settings, { id: 'fake', value: { SECOND: 'second-private' } }),
    ])
    const data = await readAgentUserData(file)
    expect(Object.keys(data.projects)).toEqual([root, `${root}/second`])
    expect(data.env.fake).toEqual({ FIRST: 'first-private', SECOND: 'second-private' })
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).toContain('second-private')
  })

  it('rejects corrupt saved credentials without echoing their values', async () => {
    const { root } = await configTestProject()
    const file = join(root, 'agents.json')
    await writeFile(file, JSON.stringify({ version: 1, projects: {}, env: { fake: { TOKEN: { value: 'private-value' } } } }))
    await expect(readAgentUserData(file)).rejects.toThrow('Cannot read agent user settings; repair agents.json')
    await expect(readAgentUserData(file)).rejects.not.toThrow('private-value')
  })

  it('redacts overlapping secrets at chunk boundaries without truncating a large reply', () => {
    const filter = createAgentOutputFilter({ TOKEN: 'abcdefgh', SECOND_TOKEN: 'defghijk' })
    const text = `${'safe '.repeat(5000)}abcdefgh and defghijk final`
    const reply = filter.push(text.slice(0, -8)) + filter.push(text.slice(-8)) + filter.finish()
    expect(reply).toBe(`${'safe '.repeat(5000)}[redacted] and [redacted] final`)
  })
})

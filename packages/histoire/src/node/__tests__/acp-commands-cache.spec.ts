import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentCommandsCache } from '../acp/commands-cache.js'

const review = [{ name: 'review', description: 'Review changes' }]

describe('aCP commands cache', () => {
  let directory: string
  let dataFile: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'histoire-commands-'))
    dataFile = join(directory, 'agents.json')
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('skips writing an unchanged list', async () => {
    const cache = createAgentCommandsCache(dataFile, '/project')
    await cache.save('fake', review)
    const file = join(directory, 'agent-commands.json')
    // Same data in another layout; a rewrite would restore the canonical one.
    const edited = JSON.stringify(JSON.parse(await readFile(file, 'utf8')), null, 2)
    await writeFile(file, edited)
    await cache.save('fake', review)
    expect(await readFile(file, 'utf8')).toBe(edited)
  })

  it('keeps other projects and evicts the least recently written ones', async () => {
    for (let index = 0; index < 21; index++) await createAgentCommandsCache(dataFile, `/project-${index}`).save('fake', review)
    expect(await createAgentCommandsCache(dataFile, '/project-0').load()).toEqual({})
    expect(await createAgentCommandsCache(dataFile, '/project-1').load()).toEqual({ fake: review })
    expect(await createAgentCommandsCache(dataFile, '/project-20').load()).toEqual({ fake: review })
  })

  it('reads files written in the earlier per-agent layout', async () => {
    await writeFile(join(directory, 'agent-commands.json'), JSON.stringify({ '/project': { fake: review } }))
    expect(await createAgentCommandsCache(dataFile, '/project').load()).toEqual({ fake: review })
  })
})

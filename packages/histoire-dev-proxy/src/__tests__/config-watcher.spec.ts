import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { encodeWatchInputs, watchConfiguration } from '../../dist/config/watcher.js'

it('reports a config save made immediately after the previous save was reported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-config-watcher-'))
  const file = join(root, 'histoire.config.ts')
  const initial = 'export default { theme: { title: "Initial" } }'
  const first = 'export default { theme: { title: "First" } }'
  const latest = 'export default { theme: { title: "Latest" } }'
  const observed: string[] = []
  let watcher: Awaited<ReturnType<typeof watchConfiguration>> | undefined
  try {
    writeFileSync(file, initial)
    watcher = await watchConfiguration(encodeWatchInputs(new Map([[file, Buffer.from(initial)]])), (_source, changedFile) => {
      const contents = readFileSync(changedFile, 'utf8')
      observed.push(contents)
      if (contents === first) writeFileSync(file, latest)
    })

    writeFileSync(file, first)
    await expect.poll(() => observed).toEqual([first, latest])
  }
  finally {
    await watcher?.close()
    await rm(root, { recursive: true, force: true })
  }
})

import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Build directory proves package shape rather than source aliases. */
const dist = fileURLToPath(new URL('../../dist/', import.meta.url))

describe('sDK portable import', () => {
  it('loads built public and internal entries without DOM/framework globals', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      delete globalThis.window; delete globalThis.document;
      const sdk = await import(${JSON.stringify(new URL('../../dist/index.js', import.meta.url).href)});
      await import(${JSON.stringify(new URL('../../dist/internal.js', import.meta.url).href)});
      if (new sdk.HistoireSdkError('DISPOSED', 'closed').code !== 'DISPOSED') throw new Error('Error mismatch');
      console.log('portable');
    `], { encoding: 'utf8' })
    expect(output.trim()).toBe('portable')
  })

  it('limits emitted runtime/declaration imports to local code and protocol', async () => {
    const queue = [dist]
    while (queue.length) {
      const path = queue.pop()!
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = `${path}/${entry.name}`
        if (entry.isDirectory()) {
          queue.push(file)
          continue
        }
        if (!/\.(?:js|d\.ts)$/.test(entry.name)) continue
        const source = await readFile(file, 'utf8')
        for (const match of source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
          expect(match[2].startsWith('.') || match[2] === '@histoire/protocol', `${file} imports ${match[2]}`).toBe(true)
        }
      }
    }
  })
})

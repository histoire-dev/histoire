import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Portable built package directory; test/development imports are excluded. */
const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('published portable graph', () => {
  it('imports built entry without DOM globals', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      delete globalThis.window; delete globalThis.document;
      const api = await import(${JSON.stringify(new URL('../../dist/index.js', import.meta.url).href)});
      if (api.STATE_SYNC !== '__histoire:state-sync') throw new Error('Missing preview compatibility');
      console.log('portable');
    `], { encoding: 'utf8' })
    expect(output.trim()).toBe('portable')
  })

  it('ships JavaScript/declarations with only relative portable imports', async () => {
    const queue = [`${packageRoot}/dist`]
    let declarations = 0
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
        if (entry.name.endsWith('.d.ts')) declarations++
        const imports = source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)
        for (const match of imports) expect(match[2].startsWith('.'), `${file} imports ${match[2]}`).toBe(true)
        expect(source).not.toMatch(/\b(?:HTMLElement|HistoireTestHandler|HistoireTestContext)\b/)
      }
    }
    expect(declarations).toBeGreaterThan(0)
  })
})

import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { getStaticClientPreloads } from '../util/client-optimizer.js'
import { createModuleVersioner, isHistoireModuleVersionUrl } from '../vite/module-version.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/**
 * Creates a package directory holding a `dist/index.js` and a `src/index.js`.
 * @param name Package name written to its manifest.
 */
function createPackage(name: string) {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'histoire-module-version-'))
  tempDirs.push(root)
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name }), 'utf8')
  fs.mkdirSync(join(root, 'dist/nested'), { recursive: true })
  fs.mkdirSync(join(root, 'src'))
  fs.writeFileSync(join(root, 'dist/index.js'), 'export default 1', 'utf8')
  fs.writeFileSync(join(root, 'dist/nested/style.css'), '.a{}', 'utf8')
  fs.writeFileSync(join(root, 'dist/icons.json'), '{}', 'utf8')
  fs.writeFileSync(join(root, 'src/index.js'), 'export default 1', 'utf8')
  return root
}

describe('createModuleVersioner', () => {
  it('versions every built module of a Histoire package with one stable value', () => {
    const root = createPackage('@histoire/example')
    const version = createModuleVersioner()

    const script = version(join(root, 'dist/index.js'))
    const style = version(join(root, 'dist/nested/style.css'))

    expect(script).toMatch(/\/dist\/index\.js\?v=hst-[\w-]+$/)
    expect(style.slice(style.indexOf('?'))).toBe(script.slice(script.indexOf('?')))
    expect(isHistoireModuleVersionUrl(script)).toBe(true)
  })

  it('replaces an existing optimizer version so every import of a file shares one URL', () => {
    const root = createPackage('histoire')
    const version = createModuleVersioner()
    const plain = version(join(root, 'dist/index.js'))

    expect(version(`${join(root, 'dist/index.js')}?v=0123abcd`)).toBe(plain)
  })

  it('leaves source files, foreign packages, JSON and special queries untouched', () => {
    const histoire = createPackage('@histoire/app')
    const foreign = createPackage('vue')
    const version = createModuleVersioner()

    for (const id of [
      join(histoire, 'src/index.js'),
      join(foreign, 'dist/index.js'),
      `${join(histoire, 'dist/nested/style.css')}?inline`,
      // Native JSON modules must keep their transform-free URL.
      join(histoire, 'dist/icons.json'),
      '\0virtual:$histoire-preview-runtime',
    ]) {
      expect(version(id)).toBe(id)
    }
  })

  it('changes the version with its salt, so cached modules never outlive the dependencies they import', () => {
    const root = createPackage('@histoire/example')
    const version = createModuleVersioner()
    const file = join(root, 'dist/index.js')

    expect(version(file, 'run-a')).toBe(version(file, 'run-a'))
    expect(version(file, 'run-b')).not.toBe(version(file, 'run-a'))
  })

  it('changes the version when a built file changes', () => {
    const root = createPackage('@histoire/example')
    const before = createModuleVersioner()(join(root, 'dist/index.js'))
    fs.writeFileSync(join(root, 'dist/index.js'), 'export default 2 // longer', 'utf8')

    expect(createModuleVersioner()(join(root, 'dist/index.js'))).not.toBe(before)
  })
})

describe('getStaticClientPreloads', () => {
  it('keeps Histoire-versioned modules while excluding optimizer URLs', () => {
    const graph = new Map<string, string[]>([
      ['/entry.js', ['/@fs/app/dist/a.js?v=hst-1', '/deps/vue.js?v=0123abcd']],
      ['/@fs/app/dist/a.js?v=hst-1', []],
      ['/deps/vue.js?v=0123abcd', []],
    ])

    expect(getStaticClientPreloads(graph, ['/entry.js'])).toEqual(['/entry.js', '/@fs/app/dist/a.js?v=hst-1'])
  })
})

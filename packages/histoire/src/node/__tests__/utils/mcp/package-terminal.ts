/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { expect } from 'vitest'
import { startBodyMarker } from '../terminal/body-marker.js'
import { startPty } from '../terminal/pty.js'
import { helperSource, watchStorySource } from '../terminal/watch-project.js'
import { assertMcpProcessReleased } from './process.js'

/** Modules the terminal console needs at run time; each must ship in the matching tarball. */
const SHIPPED_TERMINAL_MODULES: Record<string, string[]> = {
  'histoire': [
    'dist/node/bin.js',
    'dist/node/commands/dev-host.js',
    'dist/node/runtime/terminal/adapter.js',
    'dist/node/runtime/terminal/handlers/index.js',
    'dist/node/runtime/terminal/watch/index.js',
  ],
  '@histoire/cli': [
    'dist/cli.js',
    'dist/commands/dev.js',
    'dist/terminal/panel.js',
    'dist/terminal/plain.js',
    'dist/terminal/clipboard.js',
    'dist/terminal/info/qr.js',
    'dist/terminal/output/sanitize.js',
    'dist/terminal/protocol/core.js',
    'dist/terminal/views/index.js',
    'dist/terminal/watch/controller.js',
    'dist/workbench-url.js',
  ],
  '@histoire/dev-proxy': [
    'dist/protocol.js',
    'dist/server/observe.js',
  ],
}

/** Optional peers are resolved lazily and may be absent in consumers without browser tests. */
const OPTIONAL_PEERS = new Set(['playwright', 'playwright-core', 'vitest', '@vitest/browser-playwright'])

/**
 * Fails when a published tarball lacks a terminal/runtime module.
 * @param inventories Tarball file lists by package name (`package/...` entries).
 */
export function assertTerminalModulesPacked(inventories: Record<string, string[]>) {
  for (const [name, files] of Object.entries(SHIPPED_TERMINAL_MODULES)) {
    for (const file of files) {
      if (!inventories[name]?.includes(`package/${file}`)) throw new Error(`Published ${name} missing ${file}`)
    }
  }
}

/** Bare module specifiers of a built JavaScript file (static, dynamic and `require` forms). */
function bareSpecifiers(source: string) {
  const found = new Set<string>()
  // The lookbehind skips member calls such as `Array.from('x')` or `Buffer.from(...)`.
  for (const match of source.matchAll(/(?<![.\w$])(?:from|import|require)\s*(?:\(\s*)?(["'])([^"']+)\1/g)) {
    const specifier = match[2]
    if (/^[./]/.test(specifier) || specifier.startsWith('node:') || builtinModules.includes(specifier.split('/')[0])) continue
    found.add(specifier)
  }
  return found
}

/**
 * Files an `exports` entry points at: a plain target, every conditional (`types`, `default`, ...)
 * target, or the first target of a fallback array (the one Node uses). Undefined for a `null`
 * entry, which blocks the subpath.
 */
function exportTargets(entry: unknown): string[] | undefined {
  if (entry === null) return undefined
  if (typeof entry === 'string') return [entry]
  if (Array.isArray(entry)) return entry.length ? exportTargets(entry[0]) : undefined
  if (!entry || typeof entry !== 'object') return []
  // A conditions object whose every branch is blocked blocks the subpath too.
  const targets = Object.values(entry).flatMap(value => exportTargets(value) ?? [])
  return targets.length ? targets : undefined
}

/**
 * `exports` as a subpath map: the string, array and conditions-only shorthands all mean the `.` entry.
 * @param exported Raw `exports` field of a manifest.
 */
function exportsMap(exported: unknown): Record<string, unknown> {
  const isMap = !!exported && typeof exported === 'object' && !Array.isArray(exported) && Object.keys(exported).some(key => key.startsWith('.'))
  return isMap ? exported as Record<string, unknown> : { '.': exported }
}

/**
 * Package-relative files a package `exports` field serves for `subpath`, resolved like Node: an exact
 * key wins, otherwise the `./prefix/*` pattern with the longest prefix, then the longest key (its `*`
 * replaced by the matched part); undefined when not exported or blocked with `null`.
 */
function exportedFiles(exports: unknown, subpath: string): string[] | undefined {
  const exported = exportsMap(exports)
  if (subpath in exported) return exportTargets(exported[subpath])
  let best: { key: string, prefix: string, matched: string, entry: unknown } | undefined
  for (const [key, entry] of Object.entries(exported)) {
    if (!key.includes('*')) continue
    const [prefix, suffix] = key.split('*')
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length <= prefix.length + suffix.length) continue
    if (best && (best.prefix.length > prefix.length || (best.prefix.length === prefix.length && best.key.length >= key.length))) continue
    best = { key, prefix, matched: subpath.slice(prefix.length, subpath.length - suffix.length), entry }
  }
  return best && exportTargets(best.entry)?.map(target => target.replaceAll('*', best.matched))
}

/**
 * Whether a pattern target (`./dist/x/*.js`) matches at least one shipped file.
 * @param installed Installed package directory.
 * @param target Package-relative target containing one `*`.
 */
function patternTargetShips(installed: string, target: string) {
  const [prefix, suffix] = target.split('*')
  const directory = resolve(installed, dirname(`${prefix}x`))
  if (!existsSync(directory)) return false
  const head = resolve(installed, prefix)
  return readdirSync(directory, { recursive: true, encoding: 'utf8' }).some((file) => {
    const path = resolve(directory, file)
    return path.startsWith(head) && path.endsWith(suffix) && path.length > head.length + suffix.length
  })
}

/**
 * Problems with the installed package's own exports: each target must ship in the tarball (a
 * pattern target must match at least one file), so a mistyped `exports` path fails here instead of in a consumer.
 * @param installed Installed package directory.
 * @param name Package name, for messages.
 * @param exports Its `exports` field.
 */
function missingExportTargets(installed: string, name: string, exports: unknown) {
  return Object.entries(exportsMap(exports)).flatMap(([key, entry]) => (exportTargets(entry) ?? [])
    .filter(target => !(key.includes('*') ? patternTargetShips(installed, target) : existsSync(resolve(installed, target))))
    .map(target => `${name} exports ${key} as missing ${target}`))
}

/** Package name and subpath (`./x`) of a bare specifier. */
function splitSpecifier(specifier: string) {
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  return { name, subpath: specifier.length > name.length ? `.${specifier.slice(name.length)}` : '.' }
}

/** Whether `name` is installed next to or above `directory` (the layout Node resolves through). */
function installedFrom(directory: string, name: string): string | undefined {
  for (let current = directory; ; current = dirname(current)) {
    const candidate = resolve(current, 'node_modules', name)
    if (existsSync(candidate)) return candidate
    if (dirname(current) === current) return undefined
  }
}

/**
 * Every bare import in the installed package's built output must be declared by that package
 * (never satisfied by a workspace-only or transitive accident), installed from where the package lives,
 * and, for first-party packages, exported with targets that exist. The package's own export targets must ship too.
 * @param consumerRoot Directory holding the consumer's `node_modules`.
 * @param name Installed package to inspect.
 * @param directories Built directories (or files) inside the package to scan.
 */
export async function assertShippedImportsResolve(consumerRoot: string, name: string, directories: string[]) {
  const installed = await realpath(resolve(consumerRoot, 'node_modules', name))
  const manifest = JSON.parse(await readFile(resolve(installed, 'package.json'), 'utf8'))
  const declared = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies }
  const problems: string[] = manifest.exports ? missingExportTargets(installed, name, manifest.exports) : []
  const specifiers = new Map<string, string>()
  for (const directory of directories) {
    const base = resolve(installed, directory)
    const files = directory.endsWith('.js') ? [''] : (await readdir(base, { recursive: true })).filter(file => file.endsWith('.js'))
    for (const file of files) {
      for (const specifier of bareSpecifiers(await readFile(resolve(base, file), 'utf8'))) specifiers.set(specifier, `${directory}/${file}`)
    }
  }
  // An empty scan would pass vacuously.
  expect(specifiers.size).toBeGreaterThan(0)
  for (const [specifier, origin] of specifiers) {
    const { name: dependency, subpath } = splitSpecifier(specifier)
    if (dependency === name) continue
    if (!declared[dependency]) {
      problems.push(`${specifier} (from ${origin}) is not declared by ${name}`)
      continue
    }
    const location = installedFrom(installed, dependency)
    if (!location) {
      // Only optional peers may be missing from the consumer.
      if (!OPTIONAL_PEERS.has(dependency)) problems.push(`${specifier} (from ${origin}) does not resolve from ${name}`)
      continue
    }
    const exported = JSON.parse(await readFile(resolve(location, 'package.json'), 'utf8')).exports
    if (!dependency.startsWith('@histoire/') || !exported) continue
    const files = exportedFiles(exported, subpath)
    if (!files) problems.push(`${specifier} (from ${origin}) is not exported by ${dependency}`)
    else if (!files.every(file => existsSync(resolve(location, file)))) problems.push(`${specifier} (from ${origin}) maps to a file ${dependency} does not ship`)
  }
  expect(problems).toEqual([])
}

/** Quiet two-story project (one passing browser test each) next to the consumer's own sources. */
async function createConsumerTerminalProject(root: string, endpoint: string) {
  const directory = resolve(root, 'terminal workflow')
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { plugins: [vue()], server: { open: false } };`)
  await writeFile(resolve(directory, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false, test: { collectTimeout: 60000, runStallTimeout: 60000 } };
`)
  for (const id of ['a', 'b']) {
    await writeFile(resolve(directory, `helper-${id}.ts`), helperSource(id))
    await writeFile(resolve(directory, `${id.toUpperCase()}.story.vue`), watchStorySource(id, endpoint))
  }
  return directory
}

/**
 * Runs the installed CLI the way a user would, outside the workspace: a TUI session that runs the
 * book from the Tests view and quits, then a plain `--test-watch` session that reruns only the
 * story whose helper changed. Every test body reports to a local endpoint, so which tests ran is observed.
 * @param consumer Installed consumer (needs the browser peers and `@vitejs/plugin-vue`).
 * @param consumer.root Consumer directory.
 * @param consumer.cli Installed `bin.mjs`.
 */
export async function probePackageTerminal(consumer: { root: string, cli: string }) {
  const marker = await startBodyMarker()
  const cleanup: (() => unknown)[] = [() => marker.close()]
  try {
    const cwd = await createConsumerTerminalProject(consumer.root, marker.url)
    const args = ['dev', '--config', 'custom config.ts', '--port', '0', '--host', '127.0.0.1', '--no-mcp']

    // TUI: raw terminal, Tests view runs the whole book in the real browser, `q` restores everything.
    const tui = startPty({ entry: consumer.cli, args, cwd, environment: { BROWSER: 'none' }, columns: 120, rows: 36 })
    cleanup.push(() => tui.close())
    const [, url] = await tui.waitFor(/Local {2}(http:\/\/127\.0\.0\.1:\d+\/)/)
    await tui.waitFor(/Ready in/)
    expect(await tui.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false })
    let mark = tui.mark()
    tui.write('t')
    await tui.waitFor(/Press r to run the selected scope/, { from: mark })
    tui.write('r')
    await tui.waitFor(/2 tests · 2 passed · 0 failed · 0 skipped/, { from: mark, timeout: 240_000 })
    expect(marker.urls().map(request => /story=(\w+)/.exec(request)![1]).sort()).toEqual(['a', 'b'])
    // A key right behind Escape would read as Alt+key, so wait for the main screen first.
    mark = tui.mark()
    tui.write('\u001B')
    await tui.waitForRaw(/\u001B\[\?1049l/, { from: mark })
    tui.write('q')
    expect(await tui.waitForExit()).toBe(0)
    expect(tui.exitFlags()).toMatchObject({ canonical: true, echo: true })
    await assertMcpProcessReleased({ pid: undefined }, url)

    // Plain watch: no input needed to start; an edit of one helper reruns exactly that story.
    const plain = startPty({ entry: consumer.cli, args: [...args, '--no-tui', '--test-watch'], cwd, environment: { BROWSER: 'none' }, columns: 120, rows: 36 })
    cleanup.push(() => plain.close())
    await plain.waitFor(/Passed · 2 tests · 2 passed · 0 failed · 0 skipped/, { timeout: 240_000 })
    await plain.waitFor(/Watch: waiting for changes in all stories/)
    const seen = marker.urls().length
    mark = plain.mark()
    await writeFile(resolve(cwd, 'helper-a.ts'), helperSource('a', 1))
    await plain.waitFor(/Passed · 1 test · 1 passed · 0 failed · 0 skipped/, { from: mark, timeout: 240_000 })
    expect(marker.urls().slice(seen).map(request => /story=(\w+)/.exec(request)![1])).toEqual(['a'])
    plain.write('quit\n')
    expect(await plain.waitForExit()).toBe(0)
    expect(plain.exitFlags()).toMatchObject({ canonical: true, echo: true })
  }
  finally {
    for (const close of cleanup.reverse()) await close()
  }
}

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { generateOfficialIndex } from '../../../../../../scripts/marketplace/generate-official-index.mjs'
import index from '../../marketplace/catalog/official.json' with { type: 'json' }
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { jobManifest } from './jobs-fixture.js'

/** Invoke actual CLI to prove release tooling writes portable history, without package execution. */
const execute = promisify(execFile)
/** Snapshot entry point under test, with optional root argument for isolated release workspaces. */
const script = fileURLToPath(new URL('../../../../../../scripts/marketplace/snapshot-official-history.mjs', import.meta.url))

afterEach(disposeConfigProjects)

/** Reuse shipped identities and shared minimal manifest; fixtures contain JSON only. */
async function historyProject() {
  const { root } = await configTestProject()
  for (const entry of index) {
    const directory = `${root}/packages/histoire-${entry.id.slice('@histoire/'.length)}`
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/package.json`, JSON.stringify({ name: entry.id, version: '1.0.0', histoire: { marketplace: jobManifest } }))
  }
  return { root, directory: `${root}/packages/histoire-plugin-a11y` }
}

// Boundary: real snapshot CLI, real validator, persisted JSON and actual generator consumer.
// Defect: append on every invocation, retain malformed metadata, lose old releases or copy current peers backwards.
it('snapshots missing versions once, drops invalid fields with diagnostics, and generates version-scoped history', async () => {
  const { root, directory } = await historyProject()
  await writeFile(`${directory}/marketplace-history.json`, JSON.stringify([
    { version: '0.8.0', requires: { vite: '^5' }, frameworks: ['vue'] },
    { version: '0.9.0', requires: { vite: '^6' }, frameworks: [], publishedAt: '2026-11-01T12:00:00Z' },
  ]))
  await writeFile(`${directory}/package.json`, JSON.stringify({ name: '@histoire/plugin-a11y', version: '1.0.0', histoire: { marketplace: {
    ...jobManifest,
    requires: { vite: 3 },
    releaseNotes: [{ kind: 'feature', text: 'New tests' }, { kind: 'fix', text: 'x'.repeat(501) }],
    migrations: [{ from: '<1', ops: [{ op: 'rename-option', from: '__proto__.value', to: 'safe' }] }],
  } } }))
  const first = await execute(process.execPath, [script, root])
  expect(first.stderr).toContain('requires.vite')
  expect(first.stderr).toContain('releaseNotes.1.text')
  expect(first.stderr).toContain('migrations.0.ops.0.from')
  const bytes = await readFile(`${directory}/marketplace-history.json`, 'utf8')
  expect(JSON.parse(bytes)).toEqual([
    { version: '1.0.0', requires: {}, frameworks: [], releaseNotes: [{ kind: 'feature', text: 'New tests' }], migrations: [] },
    { version: '0.9.0', requires: { vite: '^6' }, frameworks: [], publishedAt: '2026-11-01T12:00:00Z' },
    { version: '0.8.0', requires: { vite: '^5' }, frameworks: ['vue'] },
  ])
  await execute(process.execPath, [script, root])
  expect(await readFile(`${directory}/marketplace-history.json`, 'utf8')).toBe(bytes)
  const generated = (await generateOfficialIndex(root)).find(entry => entry.id === '@histoire/plugin-a11y')!
  expect(generated.history).toEqual(JSON.parse(bytes))
  expect(generated.versions).toEqual([{ version: '1.0.0', compatible: true }, { version: '0.9.0', date: '2026-11-01T12:00:00Z', compatible: true }, { version: '0.8.0', compatible: true }])
})

it('bounds history to 50 newest unique versions and rejects invalid release identities', async () => {
  const { root, directory } = await historyProject()
  const oldest = { version: '0.0.0', requires: {}, frameworks: [] }
  await writeFile(`${directory}/marketplace-history.json`, JSON.stringify([
    oldest,
    { ...oldest, version: 'invalid' },
    ...Array.from({ length: 51 }, (_, index) => ({ ...oldest, version: `0.${index + 1}.0` })),
    oldest,
  ]))
  const { stderr } = await execute(process.execPath, [script, root])
  expect(stderr).toContain('version')
  expect(stderr).toContain('50')
  const history = JSON.parse(await readFile(`${directory}/marketplace-history.json`, 'utf8'))
  expect(history.map(entry => entry.version)).toEqual(['1.0.0', ...Array.from({ length: 49 }, (_, index) => `0.${51 - index}.0`)])
})

// Exact versions may include build metadata; normalization must not erase their published identity.
it('preserves build metadata in exact versions and never rewrites an existing same-version snapshot', async () => {
  const { root, directory } = await historyProject()
  await writeFile(`${directory}/package.json`, JSON.stringify({ name: '@histoire/plugin-a11y', version: '1.0.0+build.1', histoire: { marketplace: jobManifest } }))
  await execute(process.execPath, [script, root])
  const bytes = await readFile(`${directory}/marketplace-history.json`, 'utf8')
  expect(JSON.parse(bytes)).toEqual([{ version: '1.0.0+build.1', requires: {}, frameworks: [] }])
  await writeFile(`${directory}/package.json`, JSON.stringify({ name: '@histoire/plugin-a11y', version: '1.0.0+build.1', histoire: { marketplace: { ...jobManifest, requires: { vite: '^7' }, releaseNotes: [{ kind: 'feature', text: 'Unreleased edit' }] } } }))
  await execute(process.execPath, [script, root])
  expect(await readFile(`${directory}/marketplace-history.json`, 'utf8')).toBe(bytes)
})

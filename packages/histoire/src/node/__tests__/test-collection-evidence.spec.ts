import type { CollectionEvidence } from '../test/eligibility/evidence.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { captureTestCollectionEligibility, captureTestCollectionGeneration } from '../test/eligibility/index.js'
import { createEligibilityProject } from './utils/eligibility-project.js'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

/** Two stories, each with its own helper, over the shared setup graph. */
async function createProject() {
  const files: Record<string, string> = {}
  for (const id of ['a', 'b']) {
    files[`shared-${id}.js`] = `export const ${id} = 1`
    files[`${id}.story.js`] = `import "./shared-${id}.js";export default {}`
  }
  const project = await createEligibilityProject({ files, stories: ['a', 'b'] })
  disposers.push(project.dispose)
  /** Verify through a fresh operation, as each collection request does. */
  const verify = (evidence: CollectionEvidence | undefined) => evidence ? captureTestCollectionGeneration(project.ctx)!.verify(evidence) : Promise.resolve(false)
  return { ...project, verify }
}

it('admits stories whose setup reaches installed packages and import-free virtual modules', async () => {
  const { ctx, verify } = await createProject()
  const proof = await captureTestCollectionEligibility(ctx)
  expect([...proof.evidence.keys()].sort()).toEqual(['a', 'b'])
  expect(await verify(proof.evidence.get('a'))).toBe(true)
})

it('retires only stories whose graph contains an edited module', async () => {
  const { ctx, root, server, verify } = await createProject()
  const proof = await captureTestCollectionEligibility(ctx)
  const inFlight = captureTestCollectionGeneration(ctx)!
  server.watcher.emit('all', 'change', join(root, 'shared-a.js'))
  expect(await verify(proof.evidence.get('a'))).toBe(false)
  expect(await verify(proof.evidence.get('b'))).toBe(true)
  // Work mounted from the old graph must not publish after the edit.
  expect(() => inFlight.assertCurrent()).toThrow()
})

// Hidden build dirs (another Nuxt process regenerating `.nuxt/`) are never part of a graph.
it.each([['change', 'unrelated.ts'], ['add', '.nuxt/ui/button.ts'], ['unlink', '.nuxt/tsconfig.json']])('keeps evidence and in-flight operations through %s of %s outside every graph', async (event, file) => {
  const { ctx, root, server, verify } = await createProject()
  const proof = await captureTestCollectionEligibility(ctx)
  const inFlight = captureTestCollectionGeneration(ctx)!
  server.watcher.emit('all', event, join(root, file))
  expect(await verify(proof.evidence.get('a'))).toBe(true)
  expect(await verify(proof.evidence.get('b'))).toBe(true)
  expect(() => inFlight.assertCurrent()).not.toThrow()
})

it.each([['add', 'new.ts'], ['unlink', 'unrelated.ts'], ['change', 'tsconfig.json']])('retires every story on %s of %s', async (event, file) => {
  const { ctx, root, server, verify } = await createProject()
  const proof = await captureTestCollectionEligibility(ctx)
  server.watcher.emit('all', event, join(root, file))
  expect(await verify(proof.evidence.get('a'))).toBe(false)
  expect(await verify(proof.evidence.get('b'))).toBe(false)
})

it('revalidates unwatched installed and virtual leaves by content', async () => {
  const { ctx, root, verify, setVirtualData } = await createProject()
  let proof = await captureTestCollectionEligibility(ctx)
  setVirtualData('export const preference = "dark"')
  expect(await verify(proof.evidence.get('a'))).toBe(false)
  proof = await captureTestCollectionEligibility(ctx)
  expect(await verify(proof.evidence.get('a'))).toBe(true)
  await writeFile(join(root, 'node_modules/installed/index.js'), 'export const installed = 1234')
  expect(await verify(proof.evidence.get('a'))).toBe(false)
})

it('keeps the current generation and later proofs usable after a cancelled proof', async () => {
  const { ctx, verify } = await createProject()
  const before = captureTestCollectionGeneration(ctx)!
  const controller = new AbortController()
  const cancelled = captureTestCollectionEligibility(ctx, undefined, controller.signal)
  controller.abort()
  await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(() => before.assertCurrent()).not.toThrow()
  const proof = await captureTestCollectionEligibility(ctx)
  expect([...proof.evidence.keys()].sort()).toEqual(['a', 'b'])
  expect(await verify(proof.evidence.get('b'))).toBe(true)
})

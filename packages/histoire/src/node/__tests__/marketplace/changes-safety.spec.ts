import type { ChangeRequest } from '@histoire/shared'
import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { closeContext, createContext } from '../../context.js'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { createPlanStore } from '../../marketplace/changes/plan-store.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { jobManifest } from './jobs-fixture.js'

/** Pure metadata input; project modules must never execute while planning. */
const resolvePlugin = async () => ({ manifest: jobManifest, version: '1.2.3' })
/** A package-changing intent requiring safe config inputs. */
const request: ChangeRequest = { kind: 'install', id: 'test-plugin', prefs: { community: false, packageManager: 'pnpm', afterInstall: 'ask', skippedVersions: {} } }
afterEach(disposeConfigProjects)

it.each([
  'import project from "./package.json"; export default project',
  'export { default } from "./package.json"',
  'const project = require("./package.json"); module.exports = project',
  'export default await import("./package.json")',
])('makes a native transitive package input manual without running it: %s', async (helper) => {
  const source = 'import "./helper.mjs"; export default { plugins: [] }\n'
  const { root, file } = await configTestProject(source)
  await writeFile(`${root}/helper.mjs`, `${helper}\nthrow new Error("planner executed config")`)
  const plan = await createPlanStore({ root, configFile: file, resolvePlugin }).plan(request)
  expect(plan.manual?.reason).toBe('config-not-literal')
  expect(plan.command).toBeUndefined()
  expect(plan.files).toEqual([])
  expect(await readFile(file, 'utf8')).toBe(source)
})

it('keeps type-only imports and safe cyclic module graphs automated', async () => {
  const { root, file } = await configTestProject('import type { name } from "./package.json"; import "./helper"; export default { plugins: [] }\n')
  await writeFile(`${root}/helper.ts`, 'import "./histoire.config"; export const text = "./package.json"\n')
  const store = createPlanStore({ root, configFile: file, resolvePlugin })
  const plan = await store.plan(request)
  expect(plan.manual).toBeUndefined()
  expect(plan.command?.argv).toContain('test-plugin@1.2.3')
  await writeFile(`${root}/helper.ts`, 'import project from "./package.json"; export default project\n')
  await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'stale' })
})

it('includes the loaded Vite module graph in production planning', async () => {
  const { root, file } = await configTestProject('export default { plugins: [] }\n')
  await writeFile(`${root}/package.json`, '{"name":"fixture","private":true}')
  await writeFile(`${root}/vite.config.ts`, 'import project from "./package.json"; export default { define: { NAME: JSON.stringify(project.name) } }')
  const context = await createContext({ root, mode: 'dev', configFile: file })
  try {
    const plan = await getPlanStore(context, resolvePlugin).plan(request)
    expect(plan.manual?.reason).toBe('config-not-literal')
    expect(plan.command).toBeUndefined()
  }
  finally { await closeContext(context) }
})

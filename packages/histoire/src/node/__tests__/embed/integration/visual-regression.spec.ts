import { execFile } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { baselinePath } from '../../../../../dist/node/visual/baseline.js'
import { withVisualLock } from '../../../../../dist/node/visual/files.js'
import { createVisualService } from '../../../../../dist/node/visual/service.js'
import { resolveVisualSource } from '../../../../../dist/node/visual/source.js'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'
import { openVisualTestsPane } from '../../utils/embed/workbench.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'
import { startMcpProcess } from '../../utils/mcp/process.js'

const visualConfig = 'visual:{profiles:[{id:\'small\',width:320,height:240}],threshold:0,includeAA:true},mcp:false,vite:{server:{watch:{ignored:[\'**/packages/*/dist/**\']}}},'
const card = '<script setup>defineProps({enabled:{type:Boolean,default:false},wide:{type:Boolean,default:false}})</script><template><svg width="200" height="120"><rect x="10" y="10" :width="wide?180:100" height="100" :fill="enabled?\'#208060\':\'#5060c0\'"/></svg></template>'
const story = '<script setup>import Card from \'./Card.vue\'</script><template><Story id="card" title="Card"><Variant id="one" title="One"><Card/></Variant><Variant id="two" title="Two"><Card enabled/></Variant></Story></template>'
const git = promisify(execFile)

/** Existing fixture owns dependency links and isolated optimizer outputs. */
async function fixtureProject() {
  const fixture = await createEmbedVueProject('Visual book')
  await writeFile(join(fixture.root, 'Card.vue'), card)
  await writeFile(join(fixture.root, 'Book.story.vue'), story)
  await writeFile(join(fixture.root, 'custom.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['Book.story.vue'],collectMaxThreads:1,${visualConfig}}`)
  return fixture
}

describe('visual consumer acceptance', () => {
  it('saves displayed filtered Matrix cells with complete props through real UI', async () => {
    const matrixStory = story.replace('title="Card"', 'title="Card" :init-state="()=>({shared:\'base\'})" :matrix="{axes:{enabled:[false,true],wide:[false,true]}}"')
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', embedding: false, story: matrixStory, files: { 'Card.vue': card }, config: `${visualConfig}routerMode:'hash',` })
    const page = await fixture.browser.newPage({ viewport: { width: 1440, height: 1000 } })
    let release!: () => void
    const projectionReady = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/__sandbox.html?**', async (route) => {
      await projectionReady
      await route.continue()
    })
    try {
      await page.goto(`${fixture.bookUrl}#/story/card?variantId=one&arrange=matrix`, { waitUntil: 'domcontentloaded' })
      // Cold dev server optimizes dependencies before the first app render.
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count(), { timeout: 30_000 }).toBe(4)
      await page.getByRole('button', { name: /^Select matrix cell / }).first().click({ button: 'right' })
      expect(await page.getByRole('menuitem', { name: 'Compare to main', exact: true }).count()).toBe(0)
      release()
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('button', { name: 'Add visual cases', exact: true }).isEnabled(), { timeout: 30_000 }).toBe(true)
      await page.getByRole('button', { name: /^Select matrix cell / }).first().click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Compare to main', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('group', { name: 'enabled values', exact: true }).getByRole('button').first().click()
      await expect.poll(() => page.getByRole('button', { name: /^Select matrix cell / }).count()).toBe(2)
      await page.getByRole('button', { name: 'Add visual cases', exact: true }).click()
      const casesPath = join(fixture.root, '.histoire-visual/cases')
      /** Count durable definitions, excluding in-flight atomic write files. */
      async function definitions() {
        return (await readdir(casesPath).catch(() => [])).filter(name => /^[a-f0-9]{64}\.json$/.test(name))
      }
      await expect.poll(async () => (await definitions()).length).toBe(2)
      const saved = await Promise.all((await definitions()).map(name => readFile(join(casesPath, name), 'utf8').then(JSON.parse)))
      expect(saved.map(item => item.propsOverride).sort((a, b) => Number(a.wide) - Number(b.wide))).toEqual([{ $data: {}, shared: 'base', enabled: true, wide: false }, { $data: {}, shared: 'base', enabled: true, wide: true }])
      await page.reload()
      await page.getByRole('button', { name: 'Add visual cases', exact: true }).click()
      await expect.poll(() => page.getByRole('button', { name: 'Add visual cases', exact: true }).isEnabled()).toBe(true)
      expect((await definitions()).length).toBe(2)
      await openVisualTestsPane(page)
      const panel = page.getByRole('region', { name: 'Visual tests' })
      await panel.getByRole('button', { name: 'Run', exact: true }).click()
      await expect.poll(() => panel.getByRole('button', { name: /^Review / }).count(), { timeout: 60_000 }).toBe(4)
      expect(await panel.getByRole('button', { name: /, No baseline$/ }).count()).toBe(4)
    }
    finally {
      release()
      await page.close()
      await fixture.close()
    }
  })

  it('captures canonical and two durable Matrix cases, approves, reruns, and rejects stale approval', async () => {
    const fixture = await fixtureProject()
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
    let service: ReturnType<typeof createVisualService> | undefined
    try {
      const server = await project.startDev({ port: 0, host: '127.0.0.1', mcp: false, agents: false })
      await server.ready
      const services = getProjectServices(project)
      const source = services.dev!.controller.current!
      service = createVisualService(() => resolveVisualSource(source.context, source.server, services.dev!.execution, source.isActive, source.epoch))
      const first = await service.saveCase({ storyId: 'card', variantId: 'one', label: 'Wide', propsOverride: { enabled: false, wide: true } })
      const second = await service.saveCase({ storyId: 'card', variantId: 'one', label: 'Green', propsOverride: { enabled: true, wide: false } })
      const cases = await project.visual.listCases()
      expect(cases.filter(item => item.kind === 'matrix').map(item => item.id).sort()).toEqual([first.id, second.id].sort())
      const run = await project.visual.run()
      expect(run.results.map(result => result.status)).toEqual(['missing', 'missing', 'missing', 'missing'])
      const matrix = run.results.filter(result => result.case.kind === 'matrix')
      expect(matrix[0].currentHash).not.toBe(matrix[1].currentHash)
      expect(run.results[0].spec.propsOverride).toBeUndefined()
      expect((await project.visual.approve({ runId: run.id, resultIds: run.results.map(result => result.id) })).map(receipt => receipt.status)).toEqual(['approved', 'approved', 'approved', 'approved'])
      expect((await project.visual.run()).results.map(result => result.status)).toEqual(['passed', 'passed', 'passed', 'passed'])
      await git('git', ['init', '-b', 'main'], { cwd: fixture.root })
      await git('git', ['add', '.histoire-visual'], { cwd: fixture.root })
      await git('git', ['-c', 'user.name=Visual tests', '-c', 'user.email=visual@example.test', 'commit', '-m', 'test: baseline fixture'], { cwd: fixture.root })
      const metadataPath = join(fixture.root, baselinePath({ baselineDir: '.histoire-visual' } as any, run.platform, run.results[0].case.id, 'small'))
      const original = await readFile(metadataPath, 'utf8')
      const edited = JSON.parse(original)
      edited.spec.backgroundColor = '#000000'
      await writeFile(metadataPath, JSON.stringify(edited))
      const identical = await project.visual.run()
      expect(identical.results[0]).toMatchObject({ status: 'passed', diffPixels: 0, approved: true })
      expect(identical.ok).toBe(true)
      expect(JSON.parse(await readFile(metadataPath, 'utf8')).spec.backgroundColor).toBe('#ffffff')
      await writeFile(metadataPath, JSON.stringify({ ...edited, imageHash: run.results[3].currentHash }))
      const different = await project.visual.run()
      expect(different.results[0].status).toBe('incompatible')
      expect(different.results[0].approved).toBeUndefined()
      await writeFile(metadataPath, JSON.stringify(edited))
      const committed = await project.visual.run({ baselineRef: 'main' })
      expect(committed.baselineCommit).toMatch(/^[a-f0-9]{40}$/)
      expect(committed.results.map(result => result.status)).toEqual(['passed', 'passed', 'passed', 'passed'])
      await writeFile(metadataPath, original)
      expect(await readFile(join(fixture.root, run.htmlPath), 'utf8')).toContain('Side by side')
      await expect(project.visual.run({ caseId: 'unknown' })).rejects.toThrow('selected no cases')
      const beforeHmr = await project.visual.run()
      const captureSource = resolveVisualSource(source.context, source.server, services.dev!.execution, source.isActive, source.epoch)
      await writeFile(join(fixture.root, 'Card.vue'), card.replace('#5060c0', '#c05060'))
      await expect.poll(() => captureSource.isActive(), { timeout: 10_000 }).toBe(false)
      expect((await project.visual.approve({ runId: beforeHmr.id, resultIds: [beforeHmr.results[0].id] }))[0].status).toBe('conflict')
      const afterHmr = await project.visual.run()
      expect(afterHmr.results[0].currentHash).not.toBe(beforeHmr.results[0].currentHash)
      await project.visual.approve({ runId: afterHmr.id, resultIds: afterHmr.results.map(result => result.id) })
      const abandoned = project.visual.run()
      await server.restart()
      expect(await abandoned).toMatchObject({ state: 'cancelled', stale: true })
      expect((await project.visual.listCases()).filter(item => item.kind === 'matrix').length).toBe(2)
      expect((await project.visual.approve({ runId: run.id, resultIds: [run.results[0].id] }))[0].status).toBe('conflict')
      expect((await project.visual.run()).results.map(result => result.status)).toEqual(['passed', 'passed', 'passed', 'passed'])
    }
    finally {
      await service?.close()
      await project.close()
      await fixture.close()
    }
  })

  it('cLI produces missing, approved, passing, and changed reports with meaningful exit codes', async () => {
    const fixture = await fixtureProject()
    const children: ReturnType<typeof startMcpProcess>[] = []
    /** Invoke actual installed CLI; zero exit cannot hide a no-op comparison. */
    async function run(args: string[]) {
      const child = startMcpProcess(['visual', '--config', 'custom.ts', ...args], fixture.root)
      children.push(child)
      const result = await child.waitForExit()
      return { ...result, output: child.output() }
    }
    try {
      expect((await run(['--update'])).code).toBe(2)
      const missing = await run([])
      expect(missing.code, missing.output).toBe(1)
      expect(missing.output).toContain('missing: Card')
      const updated = await run(['--update', '--all'])
      expect(updated.code, updated.output).toBe(0)
      expect(updated.output).toContain('2 approved')
      const passing = await run([])
      expect(passing.code, passing.output).toBe(0)
      expect(passing.output).toContain('Visual: 2/2 passed')
      const completed = await readdir(join(fixture.root, '.histoire/visual/runs'))
      const reportsBeforeChange = await Promise.all(completed.map(id => readFile(join(fixture.root, '.histoire/visual/runs', id, 'report.json'), 'utf8').then(JSON.parse)))
      const passingReport = reportsBeforeChange.find(report => report.results.every((result: any) => result.status === 'passed'))
      const selected = passingReport.results[0]
      const target = baselinePath({ baselineDir: '.histoire-visual' } as any, passingReport.platform, selected.case.id, 'small')
      const lockedUpdate = await withVisualLock(fixture.root, target, () => run(['--update', '--case', selected.case.id, '--profile', 'small']))
      expect(lockedUpdate.code, lockedUpdate.output).toBe(1)
      expect(lockedUpdate.output).toContain('locked by another writer')
      await writeFile(join(fixture.root, 'Card.vue'), card.replace('#5060c0', '#c05060'))
      const changed = await run([])
      expect(changed.code, changed.output).toBe(1)
      expect(changed.output).toContain('changed: Card')
      const runs = await readdir(join(fixture.root, '.histoire/visual/runs'))
      const reports = await Promise.all(runs.map(id => readFile(join(fixture.root, '.histoire/visual/runs', id, 'report.json'), 'utf8').then(JSON.parse)))
      expect(reports.some(report => report.results.some((result: any) => result.status === 'changed' && result.diffPixels > 0))).toBe(true)
    }
    finally {
      for (const child of children) {
        await child.close()
      }
      await fixture.close()
    }
  })

  it.each(['react', 'svelte4'] as const)('captures real %s canonical variants through Node visual API', async (framework) => {
    const fixture = await createMcpFrameworkProject(framework)
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    try {
      const svelte = framework === 'svelte4'
      const filename = svelte ? 'Visual.story.svelte' : 'Visual.story.tsx'
      await writeFile(join(fixture.root, filename), svelte ? '<script>export let Hst</script><Hst.Story id="visual"><Hst.Variant id="one"><svg width="100" height="100"><rect width="80" height="80" fill="#5060c0"/></svg></Hst.Variant></Hst.Story>' : 'import {Story,Variant} from \'@histoire/plugin-react\';export default function Visual(){return <Story id=\'visual\'><Variant id=\'one\'><svg width=\'100\' height=\'100\'><rect width=\'80\' height=\'80\' fill=\'#5060c0\'/></svg></Variant></Story>}')
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import {${svelte ? 'HstSvelte' : 'HstReact'}} from '@histoire/plugin-${svelte ? 'svelte' : 'react'}';export default {plugins:[${svelte ? 'HstSvelte' : 'HstReact'}()],storyMatch:['${filename}'],collectMaxThreads:1,${visualConfig}}`)
      project = await createHistoireProject({ root: fixture.root })
      const server = await project.startDev({ port: 0, mcp: false, agents: false })
      await server.ready
      const run = await project.visual.run()
      expect(run.results).toHaveLength(1)
      expect(run.results[0]).toMatchObject({ status: 'missing', currentDimensions: { width: 320, height: 240 } })
      expect(run.results[0].currentHash).toMatch(/^[a-f0-9]{64}$/)
    }
    finally {
      await project?.close()
      await fixture.close()
    }
  })

  it('drains owned CLI runtime on SIGINT and returns interruption exit code', async () => {
    const fixture = await fixtureProject()
    const child = startMcpProcess(['visual', '--config', 'custom.ts'], fixture.root)
    try {
      // Collection admission proves config processing has finished and dev resources exist.
      await child.waitFor(/Collect stories start all/)
      child.child.kill('SIGINT')
      expect(await child.waitForExit(30_000), child.output()).toEqual({ code: 130, signal: null })
    }
    finally {
      await child.close()
      await fixture.close()
    }
  })

  it('workbench captures, reviews, approves selected results, then passes next run', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', embedding: false, story, files: { 'Card.vue': card }, config: visualConfig })
    const page = await fixture.browser.newPage({ viewport: { width: 1440, height: 1000 } })
    try {
      await page.goto(`${fixture.bookUrl}story/card?variantId=one`)
      await page.locator('iframe[title="Histoire variant"]').first().contentFrame().locator('[data-test-id="sandbox-render"] svg').waitFor()
      await openVisualTestsPane(page)
      const panel = page.getByRole('region', { name: 'Visual tests' })
      await panel.getByRole('button', { name: 'Run', exact: true }).click()
      await expect.poll(async () => ({ rows: await panel.getByRole('button', { name: /^Review / }).count(), issue: await panel.getByRole('alert').allTextContents(), text: await panel.textContent() }), { timeout: 30_000 }).toMatchObject({ rows: 2, issue: [] })
      await page.getByRole('button', { name: /^Review Card › One small,/ }).click()
      await page.screenshot({ path: '/tmp/histoire-visual-review-light.png' })
      await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click()
      await page.screenshot({ path: '/tmp/histoire-visual-review-dark.png' })
      await page.setViewportSize({ width: 860, height: 760 })
      await page.screenshot({ path: '/tmp/histoire-visual-review-narrow.png' })
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Card › One', exact: true })
      await dialog.getByRole('img', { name: 'current image for Card › One', exact: true }).waitFor()
      await dialog.press('Shift+Tab')
      await expect.poll(() => dialog.getByRole('button', { name: 'Create baseline', exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
      await dialog.getByRole('button', { name: 'Create baseline', exact: true }).press('Tab')
      await expect.poll(() => dialog.getByRole('button', { name: 'Next visual result', exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
      await dialog.getByRole('button', { name: 'Create baseline', exact: true }).click()
      await expect.poll(() => dialog.getByRole('status').first().textContent()).toContain('Approved')
      await page.keyboard.press('Escape')
      await expect.poll(() => dialog.count()).toBe(0)
      await expect.poll(() => panel.getByRole('button', { name: 'Run', exact: true }).evaluate(element => element === document.activeElement)).toBe(true)
      await panel.getByRole('button', { name: 'Run options', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Run all', exact: true }).click()
      await expect.poll(() => panel.getByRole('status').first().textContent(), { timeout: 60_000 }).toContain('1 passed')
      await panel.getByRole('group', { name: 'Visual results filter', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
      await page.getByRole('button', { name: /^Review Card › One small,/ }).click()
      await dialog.getByRole('group', { name: 'Image comparison mode' }).getByRole('button', { name: 'Diff', exact: true }).click()
      await dialog.getByRole('button', { name: 'Next visual result', exact: true }).click()
      await page.getByRole('dialog', { name: 'Card › Two', exact: true }).getByRole('img', { name: 'current image for Card › Two', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: 'Card › Two', exact: true }).count()).toBe(0)
      await panel.getByRole('group', { name: 'Visual results filter', exact: true }).getByRole('button', { name: 'Changes', exact: true }).click()
      await expect.poll(() => page.getByRole('button', { name: /^Review Card › One small,/ }).count()).toBe(0)
      await panel.getByRole('checkbox', { name: 'Select Card › Two small for approval', exact: true }).check()
      await panel.getByRole('button', { name: 'Approve 1 selected', exact: true }).click()
      await expect.poll(() => panel.getByText('No visual changes', { exact: true }).count()).toBe(1)
      await panel.getByRole('button', { name: 'Run options', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Run all', exact: true }).click()
      await expect.poll(() => panel.getByRole('status').first().textContent(), { timeout: 60_000 }).toContain('2 passed')
      await panel.getByRole('group', { name: 'Visual results filter', exact: true }).getByRole('button', { name: 'All', exact: true }).click()
      await page.getByRole('button', { name: /^Review Card › One small,/ }).click()
      await dialog.getByRole('group', { name: 'Image comparison mode' }).getByRole('button', { name: 'Diff', exact: true }).click()
      await dialog.getByRole('img', { name: 'diff image for Card › One', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await expect.poll(() => dialog.count()).toBe(0)
      await expect.poll(() => page.getByRole('button', { name: /^Review Card › One small,/ }).evaluate((element: HTMLElement) => element === document.activeElement)).toBe(true)
    }
    catch (error) {
      await page.screenshot({ path: '/tmp/histoire-visual-review-failure.png' })
      await writeFile('/tmp/histoire-visual-review-failure.txt', await page.locator('body').textContent() ?? '')
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})

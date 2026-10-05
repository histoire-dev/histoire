import { cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { readPngDimensions } from '../../../runtime/browser/png.js'
import { createMcpCaptureProject } from '../../utils/mcp/capture-project.js'

describe('public Node capture and library test isolation', () => {
  it('captures dev/copied static without live files and preserves parent process while assertions fail', async () => {
    const fixture = await createMcpCaptureProject()
    const configPath = join(fixture.root, 'custom config.ts')
    await writeFile(configPath, (await readFile(configPath, 'utf8')).replace('storyMatch:[\'Deterministic.story.vue\']', 'storyMatch:[\'*.story.vue\']').replace('mcp:true', 'mcp:false').replace('build:{target:\'node\'}', 'build:{target:\'static\'}'))
    await writeFile(join(fixture.root, 'Tests.story.vue'), `<script>import {onTest} from 'histoire/client';import{it,expect}from'vitest';onTest(({canvas})=>it('attributed assertion',()=>expect(canvas.textContent).toContain('pass')))</script><template><Story id="tests"><Variant id="pass"><button>pass</button></Variant><Variant id="fail"><button>fail</button></Variant></Story></template>`)
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const parent = { cwd: process.cwd(), env: { ...process.env }, exitCode: process.exitCode, interrupt: process.listeners('SIGINT'), terminate: process.listeners('SIGTERM') }
    try {
      await expect(project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal' })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
      // Fresh collection resolves custom story identity, independent of filename.
      await expect(project.runTests({ storyId: 'tests', variantId: 'pass' })).resolves.toMatchObject({ ok: true, passed: 1 })
      await expect(project.runTests({ storyId: 'tests' })).resolves.toMatchObject({ total: 2, failed: 1, execution: { target: { storyId: 'tests', variantId: null } } })
      await expect(project.runTests({ storyId: 'unknown' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
      await expect(project.runTests({ storyId: 'tests', variantId: 'unknown' })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      const first = await project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal', globals: { theme: 'contrast' } })
      const second = await project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal', globals: { theme: 'contrast' } })
      expect(first.sha256).toBe(second.sha256)
      expect(readPngDimensions(first.png)).toEqual({ width: 480, height: 320 })
      const failing = project.runTests({ storyId: 'tests', variantId: 'fail' })
      const passing = project.runTests({ storyId: 'tests', variantId: 'pass' })
      await expect(failing).resolves.toMatchObject({ ok: false, failed: 1, tests: [expect.objectContaining({ storyId: 'tests', variantId: 'fail' })] })
      await expect(passing).resolves.toMatchObject({ ok: true, passed: 1 })
      expect(process.cwd()).toBe(parent.cwd)
      expect(process.env).toEqual(parent.env)
      expect(process.exitCode).toBe(parent.exitCode)
      expect(process.listeners('SIGINT')).toEqual(parent.interrupt)
      expect(process.listeners('SIGTERM')).toEqual(parent.terminate)
      await dev.close()
      const output = await project.build()
      const copied = join(fixture.root, 'copied-output')
      await cp(output.outDir, copied, { recursive: true })
      await writeFile(configPath, (await readFile(configPath, 'utf8')).replace('export default {', 'export default {outDir:\'copied-output\','))
      await writeFile(join(fixture.root, 'Deterministic.story.vue'), '<template><Story id="changed"><Variant id="main">changed</Variant></Story></template>')
      const preview = await project.preview({ host: '127.0.0.1', port: 0 })
      await preview.ready
      const built = await project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal', deviceScaleFactor: 2 })
      expect(readPngDimensions(built.png)).toEqual({ width: 960, height: 640 })
      expect(built.width).toBe(960)
      const largest = await project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal', width: 3840, height: 2160, deviceScaleFactor: 3 })
      expect(readPngDimensions(largest.png)).toEqual({ width: 11520, height: 6480 })
      expect(largest.png.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024)
      expect(preview.url).toContain('/book/')
      await expect(project.captureScreenshot({ storyId: 'changed', variantId: 'main' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
    }
    finally {
      await project.close()
      await fixture.close()
    }
  }, 180_000)
})

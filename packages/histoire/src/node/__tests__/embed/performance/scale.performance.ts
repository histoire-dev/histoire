import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { measureCapturePerformance, measureEmbedPerformance, recordEmbedPerformance } from '../../utils/embed/performance.js'

/** Real physical sources avoid a giant fixture array leaking into runtime state. */
function story(index: number) {
  return `<template><Story id="performance-${index}" title="Performance ${index}"><Variant v-for="variant in 5" :key="variant" :id="'variant-'+variant" :title="'Variant '+variant" :init-state="()=>({count:0})"><template #default="{state}"><button @click="state.count++">Count {{state.count}}</button></template></Variant></Story></template>`
}

describe('dedicated SDK performance baseline', () => {
  it('records 20 warm samples for 500 stories/2500 variants without treating budgets as flaky correctness gates', async () => {
    const files = Object.fromEntries(Array.from({ length: 499 }, (_, index) => [`Performance-${index + 1}.story.vue`, story(index + 1)]))
    const fixture = await createEmbedBridgeFixture({ story: story(0), files, copiedOutput: true, staticCache: true })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    try {
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const browser = await measureEmbedPerformance(page, { bookUrl: fixture.bookUrl, storyId: 'performance-0', variantIds: ['variant-1', 'variant-2'], samples: 20 })
      const descriptor = await readFile(join(fixture.outputRoot!, 'histoire-embed.json'))
      const descriptorJson = JSON.parse(descriptor.toString())
      expect(descriptorJson.catalog.stories).toHaveLength(500)
      expect(descriptorJson.catalog.stories.reduce((count, story) => count + story.variants.length, 0)).toBe(2500)
      const preview = await project.preview({ host: '127.0.0.1', port: 0 })
      await preview.ready
      // Current public capture owns a fresh browser each call. Report that
      // condition explicitly; do not claim a reused warm browser that API lacks.
      const capture = await measureCapturePerformance(project, { storyId: 'performance-0', variantId: 'variant-1' }, 20)
      const report = await recordEmbedPerformance({ browser, capture, descriptor, browserVersion: fixture.browser.version(), fixture: { name: '500 physical Vue stories; five stateful button variants each', stories: 500, variants: 2500 }, sampleCount: 20, outputPath: '/tmp/histoire-sdk16-performance-scale.json' })
      expect(report.sampleCount).toBe(20)
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await project?.close()
      await fixture.close()
    }
  })
})

import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { readPngDimensions } from '../../../runtime/browser/png.js'
import { createMcpCaptureProject } from '../../utils/mcp/capture-project.js'

describe('small screenshot viewport', () => {
  it('captures and decodes exact 128x96 pixels at device scale one', async () => {
    const fixture = await createMcpCaptureProject()
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    try {
      const dev = await project.startDev({ host: '127.0.0.1', port: 0, mcp: false })
      await dev.ready
      const capture = await project.captureScreenshot({ storyId: 'deterministic', variantId: 'normal', width: 128, height: 96, deviceScaleFactor: 1 })

      expect(readPngDimensions(capture.png)).toEqual({ width: 128, height: 96 })
      expect(capture).toMatchObject({ width: 128, height: 96, mimeType: 'image/png' })
    }
    finally {
      await project.close()
      await fixture.close()
    }
  }, 60_000)
})

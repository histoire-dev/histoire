import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { APP_PATH } from '../../alias.js'
import { shouldTransformHistoireDynamicImport } from '../../vite/mocker.js'

describe('data-only UI import boundary', () => {
  it('keeps mock transport bootstrap imports outside its own registration queue', () => {
    for (const id of ['/project/node_modules/@vitest/mocker/dist/browser.js', '/project/node_modules/.pnpm/@vitest+mocker@4/node_modules/@vitest/mocker/dist/browser.js?v=1']) {
      expect(shouldTransformHistoireDynamicImport(id)).toBe(false)
    }
    expect(shouldTransformHistoireDynamicImport('/project/node_modules/story-library/client.js')).toBe(true)
  })

  it('keeps source UI lazy imports native without excluding story/support/runtime mocking', () => {
    for (const path of ['embed/adapters/tests-surface.js', 'embed/adapters/controls.js', '../../histoire-vue/src/components/controls/HistoireControls.ts', '../../histoire-controls/src/components/json/HstJson.vue']) {
      expect(shouldTransformHistoireDynamicImport(`${resolve(APP_PATH, path)}?v=1`)).toBe(false)
    }
    for (const id of ['/project/Story.story.vue', '/project/helpers/dynamic.ts', 'virtual:$histoire-preview-runtime', resolve(APP_PATH, 'embed-other/story.js')]) expect(shouldTransformHistoireDynamicImport(id)).toBe(true)
  })
})

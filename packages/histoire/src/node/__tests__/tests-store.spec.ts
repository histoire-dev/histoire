import fs from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'

describe('story test collection watcher', () => {
  it('gates recollection on preview readiness in the app helper', () => {
    const helperPath = resolve(process.cwd(), '../histoire-app/src/app/stores/test-collection.ts')
    const source = fs.readFileSync(helperPath, 'utf8')

    expect(source).toContain('if (!storyId || !variantId || !previewReady)')
    expect(source).toContain('flush: \'sync\'')
    expect(source).toContain('immediate: true')
  })

  it('shows the registered test count in the Tests tab badge', () => {
    const paneTabsPath = resolve(process.cwd(), '../histoire-app/src/app/components/panel/PaneTabs.vue')
    const source = fs.readFileSync(paneTabsPath, 'utf8')

    expect(source).toContain('testsStore.currentDefinitions.length')
    expect(source).not.toContain('testsStore.currentFailed <= 99 ? testsStore.currentFailed : "99+"')
  })
})

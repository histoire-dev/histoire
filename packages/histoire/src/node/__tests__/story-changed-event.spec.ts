import fs from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { STORY_CHANGED_EVENT } from '../../../../histoire-shared/src/events.js'

describe('STORY_CHANGED_EVENT centralization', () => {
  it('exposes the canonical event name from @histoire/shared', () => {
    expect(STORY_CHANGED_EVENT).toBe('histoire:story-changed')
  })

  it('does not redeclare the constant in server.ts or hot.ts', () => {
    const serverPath = resolve(process.cwd(), 'src/node/server.ts')
    const hotPath = resolve(process.cwd(), '../histoire-app/src/app/util/hot.ts')

    const serverSource = fs.readFileSync(serverPath, 'utf8')
    const hotSource = fs.readFileSync(hotPath, 'utf8')

    expect(serverSource).not.toMatch(/^const STORY_CHANGED_EVENT =/m)
    expect(serverSource).toContain(`from '@histoire/shared'`)
    expect(hotSource).not.toMatch(/^export const STORY_CHANGED_EVENT =/m)
    expect(hotSource).toContain(`from '@histoire/shared'`)
  })

  it('derives the preview runtime constant from the shared event name', () => {
    const previewRuntimePath = resolve(process.cwd(), 'src/node/virtual/preview-runtime.ts')
    const source = fs.readFileSync(previewRuntimePath, 'utf8')

    expect(source).toContain(`import { STORY_CHANGED_EVENT } from '@histoire/shared'`)
    expect(source).toContain(`const STORY_CHANGED_EVENT = \${JSON.stringify(STORY_CHANGED_EVENT)}`)
    // The hardcoded literal must no longer live inside the generated runtime
    // template — only inside the shared event module.
    expect(source).not.toContain(`const STORY_CHANGED_EVENT = 'histoire:story-changed'`)
  })
})

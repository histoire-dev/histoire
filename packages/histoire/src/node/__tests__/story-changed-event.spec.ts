import { describe, expect, it } from 'vitest'
import { STORY_CHANGED_EVENT } from '../../../../histoire-shared/src/events.js'
import { readAppSource } from './utils/app-source.js'
import { readNodeSources } from './utils/node-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

describe('story changed event centralization', () => {
  it('does not redeclare the constant in the dev server or hot.ts', () => {
    const serverSource = readNodeSources('server')
    const hotSource = readAppSource('app/util/hot.ts')

    expect(serverSource).not.toMatch(/^const STORY_CHANGED_EVENT =/m)
    expect(serverSource).toContain(`from '@histoire/shared'`)
    expect(hotSource).not.toMatch(/^export const STORY_CHANGED_EVENT =/m)
    expect(hotSource).toContain(`from '@histoire/shared'`)
  })

  it('bakes the shared event name into the generated preview runtime', () => {
    // The runtime listens for this event to invalidate a changed story: a
    // second copy of the name drifting from the one the server emits would
    // leave the preview serving pre-update stories with nothing to notice it.
    expect(generatePreviewRuntimeSource()).toContain(`const STORY_CHANGED_EVENT = ${JSON.stringify(STORY_CHANGED_EVENT)}`)
  })
})

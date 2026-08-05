import { describe, expect, it } from 'vitest'
import { readWorkspaceSources } from './utils/workspace-source.js'

/**
 * Source-level guard, deliberately NOT behavioral.
 *
 * `Variant` is an async-setup Vue component that resolves `vue` while the state
 * helpers it calls (`toRawDeep`, `syncStateBundledAndExternal`) resolve
 * `@histoire/vendors/vue` — the plugin's build aliases the two onto a single
 * instance. Mounting it from this suite would pair two distinct Vue runtimes
 * and exercise a combination that never exists in production, so the invariant
 * is pinned at the source level instead, over the whole plugin client tree so a
 * file move cannot silently disable it.
 *
 * The helpers it relies on ARE covered behaviorally: `_toRawDeep` in
 * `variant-state-sync.spec.ts`, `syncVariantAutoProps` in
 * `variant-auto-props.spec.ts`.
 */
describe('vue variant implicit state sync', () => {
  const source = readWorkspaceSources('histoire-plugin-vue', 'src/client/app')

  it('seeds hidden mount variants from an implicit state SNAPSHOT', () => {
    // The hidden mount pass must start each variant from its own detached copy
    // of the story-level state, so detected controls and auto-props are
    // collected deterministically for every grid cell.
    expect(source).toContain('renderContext?.mode !== \'render\' && mountVariant.value && implicitState')
    expect(source).toContain('applyState(mountVariant.value.state, toRawDeep(implicitState()))')
    // A live two-way sync (the previous behavior) made every hidden variant
    // share one state object, so whichever mounted last won.
    expect(source).not.toContain('syncStateBundledAndExternal(mountVariant.value.state, implicitState())')
  })
})

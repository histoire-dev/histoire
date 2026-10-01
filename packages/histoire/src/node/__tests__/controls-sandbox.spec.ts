import { CONTROLS_READY, CONTROLS_RESIZE } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { readAppSource } from './utils/app-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'
import { readWorkspaceSource } from './utils/workspace-source.js'

/**
 * Custom `<template #controls>` slots execute beside their owning runtime so
 * mocked modules, component metadata and state remain local to one browsing
 * context. The controls are rendered in a dedicated sandbox iframe embedded
 * in the Controls panel.
 *
 * Source-level guards, deliberately NOT behavioral: one half is a generated
 * source string whose imports (`virtual:$histoire-theme`, `@vitest/mocker`,
 * the bundled app components) only exist inside a live browser sandbox, the
 * other half is a `.vue` single-file component this Node suite cannot compile
 * or mount. What IS behavioral lives elsewhere: the trust check in
 * `preview-message.spec.ts`, the echo-guard protocol in
 * `variant-state-sync.spec.ts`, and the wildcard-origin/marker invariants in
 * `preview-postmessage-contract.spec.ts` (which scans the whole app tree).
 */

describe('controls sandbox mode (preview runtime)', () => {
  const source = generatePreviewRuntimeSource()

  it('parses the controls mode from the sandbox URL', () => {
    expect(source).toContain(`controls: new URLSearchParams(window.location.search).get('controls') === 'true'`)
  })

  it('renders the story controls slot over a hidden story mount', () => {
    // The story must execute (with mocks active) for its slots to register;
    // only the controls slot is shown.
    expect(source).toContain('const PreviewControlsCapture = defineComponent({')
    expect(source).toContain(`slotName: 'controls'`)
    expect(source).toMatch(/PreviewControlsCapture[\s\S]{0,600}htw-sandbox-hidden/)
  })

  it('waits for hidden story metadata before rendering variant controls', () => {
    expect(source).toContain('const controlsBootstrapReady = ref(false)')
    expect(source).toContain('controlsBootstrapReady.value = true')
    expect(source).toMatch(/controlsBootstrapReady\.value[\s\S]{0,300}GenericRenderStory/)
  })

  it('receives hidden-mount readiness from every support runtime', () => {
    const sources = [
      readWorkspaceSource('histoire-plugin-vue', 'src/client/app/MountStory.ts'),
      readWorkspaceSource('histoire-plugin-svelte', 'src/client/mount.ts'),
      readWorkspaceSource('histoire', 'src/node/builtin-plugins/vanilla-support/MountStory.ts'),
    ]

    for (const runtimeSource of sources) {
      expect(runtimeSource).toContain(`emits: {`)
      expect(runtimeSource).toContain(`ready: () => true`)
      expect(runtimeSource).toContain(`emit('ready')`)
    }
  })

  it('announces readiness without posting the boot state snapshot', () => {
    // Primary preview state is authoritative. Pushing controls-frame defaults
    // would reset it, so host sends primary snapshot after CONTROLS_READY.
    const body = source.match(/async markControlsReady\(variantId\) \{([\s\S]*?)\n {6}\}/)?.[1]
    expect(body).toBeTruthy()
    expect(body).toContain('readyVariantIds.add(variantId)')
    expect(body).toContain('type: CONTROLS_READY')
    expect(body).toContain('hasControls')
    expect(body).not.toContain('postVariantStateSnapshot')
  })

  it('reports its content height so the host can size the panel iframe', () => {
    // The panel iframe has no intrinsic height: without an observed report the
    // controls render into a 0px-tall frame.
    const body = source.match(/function observeControlsResize\(\) \{([\s\S]*?)\n\}/)?.[1]
    expect(body).toBeTruthy()
    expect(body).toContain('type: CONTROLS_RESIZE')
    expect(body).toContain('new ResizeObserver(')
    // Controls mode measures intrinsic form height, excluding viewport height
    // and floating overlays. Shrinking behavior is covered by controls-resize.
    expect(body).toContain('root.getBoundingClientRect().height')
  })
})

describe('controls sandbox iframe (host component)', () => {
  const source = readAppSource('app/components/panel/StoryControlsSandboxIframe.vue')

  it('only trusts messages from its own frame and origin', () => {
    // The hand-rolled check validated the source but never the origin; the
    // shared guard enforces both.
    expect(source).toContain('isTrustedPreviewFrameMessage(event, iframe.value)')
    expect(source).not.toContain('event.source !== iframe.value?.contentWindow')
  })

  it('guards the state echo loop and gates outbound sync on controls readiness', () => {
    expect(source).toContain('createVariantStateSyncGuards')
    // Consume before the ready gate so a pre-ready host sync cannot leave a
    // suppression armed (same ordering as the preview runtime watcher).
    expect(source).toMatch(/guards\.consume\(stateKey\)[\s\S]{0,200}controlsReady/)
  })

  it('cleans up its STORY_CHANGED hot listener on unmount', () => {
    // Vite hot listeners live for the module's lifetime: without the matching
    // `off`, every story navigation leaks one handler holding this instance.
    expect(source).toContain('import.meta.hot.on(STORY_CHANGED_EVENT, onStoryChanged)')
    expect(source).toContain('import.meta.hot?.off(STORY_CHANGED_EVENT, onStoryChanged)')
  })
})

describe('controls panel integration', () => {
  it('routes every custom-controls probe through the sandbox iframe and keeps fallbacks reachable', () => {
    const source = readAppSource('app/components/panel/StoryControls.vue')

    expect(source).toContain('StoryControlsSandboxIframe')
    expect(source).not.toContain('GenericRenderStory')
    // A story without custom controls must still reach the init-state / empty-
    // state fallbacks, driven by the iframe runtime's hasControls report.
    expect(source).toContain('sandboxControlsAvailable')
  })

  it('shares the controls message names with the generated preview runtime', () => {
    // The runtime imports them from the app build: a second declaration
    // drifting from this one makes the two ends talk past each other.
    expect(CONTROLS_READY).toBe('__histoire:controls-ready')
    expect(CONTROLS_RESIZE).toBe('__histoire:controls-resize')
    expect(generatePreviewRuntimeSource()).toContain('CONTROLS_READY, CONTROLS_RESIZE')
  })
})

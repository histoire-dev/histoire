import { CONTROLS_READY, CONTROLS_RESIZE } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { readAppSource } from './utils/app-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

/**
 * Custom `<template #controls>` slots need the story's render function, which
 * the host cannot obtain for vitest-mocked stories (their module only runs
 * inside the sandbox where the mocker is active). The controls are therefore
 * rendered in a dedicated sandbox iframe embedded in the Controls panel.
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

  it('announces readiness without posting the boot state snapshot', () => {
    // With two iframes, the preview frame's state (already held by the host)
    // is authoritative — pushing this frame's defaults would reset it. The
    // host sends the full state after CONTROLS_READY instead.
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
    // scrollHeight, not the box height: the sandbox root is viewport-bound and
    // this iframe starts at 0px, so a box measure would stay 0 forever.
    expect(body).toContain('document.documentElement.scrollHeight')
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
  it('routes mocked stories to the sandbox iframe and keeps fallbacks reachable', () => {
    const source = readAppSource('app/components/panel/StoryControls.vue')

    expect(source).toContain('StoryControlsSandboxIframe')
    expect(source).toContain('hasVitestMocks')
    // A mocked story without custom controls must still reach the init-state /
    // empty-state fallbacks (driven by the iframe's hasControls report).
    expect(source).toContain('mockedControlsAvailable')
  })

  it('shares the controls message names with the generated preview runtime', () => {
    // The runtime imports them from the app build: a second declaration
    // drifting from this one makes the two ends talk past each other.
    expect(CONTROLS_READY).toBe('__histoire:controls-ready')
    expect(CONTROLS_RESIZE).toBe('__histoire:controls-resize')
    expect(generatePreviewRuntimeSource()).toContain('CONTROLS_READY, CONTROLS_RESIZE')
  })
})

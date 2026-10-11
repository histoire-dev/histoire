import type { ScreenshotSetupAttempt, ScreenshotSetupSnapshot, UiChannelError } from '@histoire/shared'
import type { ScreenshotSetupController } from '../../../histoire-app/src/app/components/canvas/toolbar/use-screenshot-setup.js'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed, ref, shallowRef } from 'vue'
import ScreenshotSetup from '../../../histoire-app/src/app/components/canvas/toolbar/ScreenshotSetup.vue'

/** Mount the real setup panel with a stable detached server snapshot. */
function mountSetup(snapshot: ScreenshotSetupSnapshot | null, reading = false) {
  const noop = () => {}
  const controller: ScreenshotSetupController = {
    snapshot: shallowRef<ScreenshotSetupSnapshot | null>(snapshot),
    error: shallowRef<UiChannelError | null>(null),
    checking: computed(() => false),
    reading: computed(() => reading),
    checked: ref(false),
    read: noop,
    checkSetup: noop,
    checkAgain: noop,
    acceptCaptureSetup: noop,
  }
  return mount(ScreenshotSetup, { props: { controller } })
}

/** Create one ordered safe diagnostic attempt. */
function attempt(overrides: Partial<ScreenshotSetupAttempt> & Pick<ScreenshotSetupAttempt, 'source' | 'diagnostic'>): ScreenshotSetupAttempt {
  return {
    reason: 'startup-failed',
    stage: 'launch',
    driver: { packageName: 'playwright-core', version: '1.59.0' },
    ...overrides,
  }
}

/** Return a needs-action snapshot containing only portable diagnostic fields. */
function snapshot(attempts: ScreenshotSetupAttempt[]): ScreenshotSetupSnapshot {
  return {
    revision: 1,
    state: 'needs-action',
    reason: 'startup-failed',
    attempts,
    repairs: [{ id: 'check-setup', label: 'Check screenshot browser setup' }],
  }
}

describe('workbench screenshot diagnostics', () => {
  it('renders an empty snapshot when metadata is not loading', () => {
    const wrapper = mountSetup(null)
    try {
      expect(wrapper.text()).toContain('Check setup to verify a screenshot browser.')
      expect(wrapper.text()).toContain('Screenshot setup needed')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('shows ordered launch failures and one selected driver identity', () => {
    const driver = { packageName: 'playwright-core' as const, version: '1.59.0' }
    const wrapper = mountSetup(snapshot([
      attempt({ source: 'headless-shell', driver, diagnostic: { code: 'process-exited', exitCode: 127, signal: 'SIGSEGV' } }),
      attempt({ source: 'chromium', reason: 'system-dependencies', driver, diagnostic: { code: 'missing-library', library: 'libEGL.so.1' } }),
      attempt({ source: 'chrome', driver, diagnostic: { code: 'executable-format' } }),
      attempt({ source: 'msedge', driver, diagnostic: { code: 'sandbox-denied' } }),
    ]))
    try {
      const text = wrapper.text()
      expect(text).toContain('Selected driver: Playwright Core 1.59.0')
      expect(text.split('Playwright Core 1.59.0')).toHaveLength(2)
      expect(text).toContain('Process exited with code 127 and signal SIGSEGV.')
      expect(text).toContain('Missing system library: libEGL.so.1.')
      expect(text).toContain('The browser executable has an unsupported format.')
      expect(text).toContain('The operating system denied the browser sandbox.')
      const positions = [
        'Process exited with code 127 and signal SIGSEGV.',
        'Missing system library: libEGL.so.1.',
        'The browser executable has an unsupported format.',
        'The operating system denied the browser sandbox.',
      ].map(label => text.indexOf(label))
      expect(positions).toEqual([...positions].sort((left, right) => left - right))
      expect(text).not.toContain('Check screenshot browser setup')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('pairs a driver-version reason with its selected upgrade repair', () => {
    const wrapper = mountSetup({
      ...snapshot([]),
      reason: 'driver-version',
      repairs: [{ id: 'upgrade-playwright', label: 'Upgrade Playwright Core' }],
    })
    try {
      expect(wrapper.text()).toContain('The Playwright version is incompatible with the selected browser source.')
      expect(wrapper.text()).toContain('Upgrade Playwright Core')
      expect(wrapper.text()).not.toContain('Restart Histoire')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('describes neutral-check failures truthfully and names an unrecognized cause', () => {
    const wrapper = mountSetup(snapshot([
      attempt({ source: 'headless-shell', reason: 'browser-missing', diagnostic: { code: 'process-exited', exitCode: 1 } }),
      attempt({ source: 'chrome', diagnostic: { code: 'protocol-error' } }),
      attempt({ source: 'chromium', stage: 'probe', diagnostic: { code: 'invalid-probe-image' } }),
      attempt({ source: 'msedge', stage: 'probe', diagnostic: { code: 'unknown' } }),
    ]))
    try {
      const text = wrapper.text()
      expect(text).toContain('The browser opened, but its neutral screenshot check did not pass.')
      expect(text).toContain('Neutral check failed after browser opened')
      expect(text).toContain('The neutral screenshot check returned an invalid PNG or unexpected dimensions.')
      expect(text).toContain('Launch failed')
      expect(text).toContain('The browser connection protocol failed.')
      expect(text).not.toContain('during the neutral check')
      expect(text).toContain('Playwright provided no recognized cause.')
      expect(text).not.toContain('Check setup for another diagnosis')
      expect(text).not.toContain('The browser could not start')
    }
    finally {
      wrapper.unmount()
    }
  })
})

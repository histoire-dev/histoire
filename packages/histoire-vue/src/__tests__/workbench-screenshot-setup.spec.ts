import type { ScreenshotSetupSnapshot } from '@histoire/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, type PropType, watch } from 'vue'
import ScreenshotSetup from '../../../histoire-app/src/app/components/canvas/toolbar/ScreenshotSetup.vue'
import { useScreenshotSetup } from '../../../histoire-app/src/app/components/canvas/toolbar/use-screenshot-setup.js'
import { screenshotChannel as channel, emitScreenshotResult as emitUiResult, resetScreenshotChannel, setupRequests, setupSnapshot } from './fixtures/screenshot-channel.js'

const SetupHost = defineComponent({
  props: {
    open: { type: Boolean, default: true },
    capturedSetup: { type: Object as PropType<ScreenshotSetupSnapshot | null>, default: null },
  },
  setup(props) {
    const controller = useScreenshotSetup()
    watch(() => props.open, (opened) => {
      if (opened) controller.read()
    }, { immediate: true })
    watch(() => props.capturedSetup, value => controller.acceptCaptureSetup(value), { immediate: true })
    return () => props.open ? h(ScreenshotSetup, { controller }) : null
  },
})

vi.mock('../../../histoire-app/src/app/util/ui-channel.js', async () => {
  const { screenshotTransport } = await import('./fixtures/screenshot-channel.js')
  return screenshotTransport
})

/** Find a real rendered button by its visible label. */
function button(wrapper: ReturnType<typeof mount>, label: string) {
  const found = wrapper.findAll('button').find(value => value.text().trim() === label)
  if (!found) throw new Error(`Missing setup action: ${label}`)
  return found
}

let clipboardDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  resetScreenshotChannel()
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
})

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('workbench screenshot setup', () => {
  it('reads metadata without probing and copies only the current repair command', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(SetupHost)
    try {
      expect(channel.send).toHaveBeenCalledExactlyOnceWith('histoire:ui:screenshot-setup', expect.objectContaining({ action: 'read' }))
      expect(setupRequests().some(request => request.action === 'check')).toBe(false)
      const request = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: request.requestId, setup: setupSnapshot() })
      expect(wrapper.text()).toContain('Screenshot setup needed')
      expect(wrapper.get('a').attributes('href')).toBe('https://histoire.dev/guide/ui-screenshots-mcp.html#check-existing-setup')
      await button(wrapper, 'Copy command').trigger('click')
      expect(writeText).toHaveBeenCalledExactlyOnceWith('pnpm add -D playwright')
      expect(wrapper.text()).toContain('Command copied')

      writeText.mockRejectedValueOnce(new Error('clipboard denied'))
      await button(wrapper, 'Copy command').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Copy unavailable')

      await wrapper.setProps({ capturedSetup: setupSnapshot({ revision: 2, reason: 'startup-failed', repairs: [{ id: 'check-setup', label: 'Check screenshot browser setup' }] }) })
      expect(wrapper.text()).not.toContain('Check screenshot browser setup')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('refreshes discovery before checking again and reports the selected renderer', async () => {
    const wrapper = mount(SetupHost)
    try {
      const readRequest = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: readRequest.requestId, setup: setupSnapshot({ state: 'unverified', reason: undefined, repairs: [] }) })
      await button(wrapper, 'Check setup').trigger('click')
      const checkRequest = setupRequests().at(-1)!
      expect(checkRequest.action).toBe('check')
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: checkRequest.requestId, setup: setupSnapshot() })

      await button(wrapper, 'Check again').trigger('click')
      const refreshRequest = setupRequests().at(-1)!
      expect(refreshRequest.action).toBe('refresh')
      expect(setupRequests().filter(request => request.action === 'check')).toHaveLength(1)
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: refreshRequest.requestId, setup: setupSnapshot({ state: 'unverified', reason: undefined, repairs: [] }) })
      const refreshedCheck = setupRequests().at(-1)!
      expect(refreshedCheck.action).toBe('check')
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: refreshedCheck.requestId, setup: setupSnapshot({ state: 'ready', reason: undefined, source: 'msedge', repairs: [] }) })
      expect(wrapper.text()).toContain('Ready')
      expect(wrapper.text()).toContain('Microsoft Edge')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not wait forever on another check and accepts reset revisions after reconnect', async () => {
    const wrapper = mount(SetupHost)
    try {
      const readRequest = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: readRequest.requestId, setup: setupSnapshot({ revision: 10, state: 'checking', reason: undefined, repairs: [] }) })
      expect(wrapper.text()).toContain('Setup status needs refresh')
      expect(button(wrapper, 'Check setup').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('Checking screenshot setup')

      await wrapper.setProps({ capturedSetup: setupSnapshot({ revision: 9, state: 'ready', reason: undefined, source: 'chrome', repairs: [] }) })
      expect(wrapper.text()).not.toContain('Google Chrome')
      for (const disconnect of [...channel.disconnect]) disconnect()
      await wrapper.setProps({ capturedSetup: setupSnapshot({ revision: 1, state: 'ready', reason: undefined, source: 'msedge', repairs: [] }) })
      expect(wrapper.text()).toContain('Microsoft Edge')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('cancels only an owned explicit check and ignores its late reply after disconnect', async () => {
    const wrapper = mount(SetupHost)
    try {
      const readRequest = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: readRequest.requestId, setup: setupSnapshot({ state: 'unverified', reason: undefined, repairs: [] }) })
      await button(wrapper, 'Check setup').trigger('click')
      const checkRequest = setupRequests().at(-1)!
      const lateListener = [...channel.listeners.get('histoire:ui:screenshot-setup-result')!][0]
      for (const disconnect of [...channel.disconnect]) disconnect()
      expect(channel.send).toHaveBeenCalledWith('histoire:ui:screenshot-setup-cancel', { requestId: checkRequest.requestId })
      lateListener({ requestId: checkRequest.requestId, setup: setupSnapshot({ state: 'ready', reason: undefined, source: 'chrome', repairs: [] }) })
      await nextTick()
      expect(wrapper.text()).toContain('Screenshot setup service unavailable')
      expect(wrapper.text()).not.toContain('Google Chrome')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps an explicit check alive when the popover content relocates', async () => {
    const wrapper = mount(SetupHost)
    try {
      const readRequest = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: readRequest.requestId, setup: setupSnapshot({ state: 'unverified', reason: undefined, repairs: [] }) })
      await button(wrapper, 'Check setup').trigger('click')
      const checkRequest = setupRequests().at(-1)!

      await wrapper.setProps({ open: false })
      expect(channel.send.mock.calls.some(([event]) => event === 'histoire:ui:screenshot-setup-cancel')).toBe(false)
      await wrapper.setProps({ open: true })
      expect(setupRequests().filter(request => request.action === 'check')).toHaveLength(1)
      await vi.waitFor(() => expect(wrapper.text()).toContain('Checking screenshot setup'))
      expect(checkRequest.requestId).toBeTruthy()
    }
    finally {
      wrapper.unmount()
    }
  })

  it('queues a check clicked during reopen metadata read while retaining a snapshot', async () => {
    const wrapper = mount(SetupHost)
    try {
      const initialRead = setupRequests()[0]
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: initialRead.requestId, setup: setupSnapshot({ revision: 1, state: 'unverified', reason: undefined, repairs: [] }) })
      await wrapper.setProps({ open: false })
      await wrapper.setProps({ open: true })
      const reopenedRead = setupRequests().at(-1)!
      expect(reopenedRead.action).toBe('read')
      expect(wrapper.text()).toContain('Setup not checked')

      await button(wrapper, 'Check setup').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Checking screenshot setup'))
      expect(setupRequests().filter(request => request.action === 'check')).toHaveLength(0)
      await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: reopenedRead.requestId, setup: setupSnapshot({ revision: 2, state: 'unverified', reason: undefined, repairs: [] }) })
      const checkRequest = setupRequests().at(-1)!
      expect(checkRequest.action).toBe('check')
      expect(checkRequest.requestId).not.toBe(reopenedRead.requestId)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('cancels its explicit check when the toolbar owner unmounts', async () => {
    const wrapper = mount(SetupHost)
    const readRequest = setupRequests()[0]
    await emitUiResult('histoire:ui:screenshot-setup-result', { requestId: readRequest.requestId, setup: setupSnapshot({ state: 'unverified', reason: undefined, repairs: [] }) })
    await button(wrapper, 'Check setup').trigger('click')
    const checkRequest = setupRequests().at(-1)!
    wrapper.unmount()
    const cancellations = channel.send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot-setup-cancel')
    expect(cancellations).toEqual([['histoire:ui:screenshot-setup-cancel', { requestId: checkRequest.requestId }]])
  })

  it('does not send a cancellation for a metadata read when the panel unmounts', () => {
    const wrapper = mount(SetupHost)
    wrapper.unmount()
    expect(channel.send.mock.calls.some(([event]) => event === 'histoire:ui:screenshot-setup-cancel')).toBe(false)
  })
})

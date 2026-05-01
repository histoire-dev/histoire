import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDomEnv } from '../dom/env.js'

describe('createDomEnv', () => {
  let env: ReturnType<typeof createDomEnv>
  let errorSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    env?.destroy()
    errorSpy?.mockRestore()
  })

  describe('when a stylesheet contains unparseable directives (e.g. Tailwind @apply)', () => {
    it('does not log a css-parsing jsdomError', () => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      env = createDomEnv()
      const style = env.window.document.createElement('style')
      style.textContent = '@tailwind base; @apply text-red-500 { }; ::not-a-real-pseudo {}'

      env.window.document.head.appendChild(style)

      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('when a script throws an unhandled exception', () => {
    it('forwards the error to console.error', () => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      env = createDomEnv()
      const script = env.window.document.createElement('script')
      script.textContent = 'throw new Error("boom from story script")'

      env.window.document.head.appendChild(script)

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom from story script'))
    })
  })
})

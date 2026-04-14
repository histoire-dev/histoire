<script setup lang="ts">
import { onTest } from 'histoire/client'
import { describe, expect, it, vi } from 'vitest'
import { getGreeting } from './vitest-mocking-greeting'
import VitestMockedGreeting from './VitestMockedGreeting.vue'

vi.mock('./vitest-mocking-greeting', () => ({
  getGreeting: vi.fn((name: string) => `Mocked by Vitest for ${name}`),
}))

const mockedGetGreeting = vi.mocked(getGreeting)

onTest(({ canvas }) => {
  describe('mocked module in story setup', () => {
    it('renders the mocked dependency output', () => {
      expect(canvas.textContent).toContain('Mocked by Vitest for Vitest browser mode')
    })

    it('tracks calls through the mocked module function', () => {
      expect(vi.isMockFunction(getGreeting)).toBe(true)
      expect(mockedGetGreeting).toHaveBeenCalledWith('Vitest browser mode')
    })
    // HMR_TEST_INSERTION_POINT
    it('fails', () => {
      expect(canvas.textContent).toContain('This test is expected to fail')
    })
  })
})
</script>

<template>
  <Story title="Vitest Mocking">
    <Variant title="mocked module in story setup">
      <VitestMockedGreeting />
    </Variant>
  </Story>
</template>

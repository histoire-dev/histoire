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
    it.skip('fails', () => {
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

    <Variant
      title="mocked with controls"
      :init-state="() => ({ name: 'Histoire' })"
    >
      <template #default="{ state }">
        <div data-test-id="controlled-name">
          {{ state.name }}
        </div>
        <VitestMockedGreeting />
      </template>

      <!-- Rendered inside the controls sandbox iframe: this story's module
           only executes where the Vitest mocker is active. -->
      <template #controls="{ state }">
        <HstText
          v-model="state.name"
          title="Name"
        />
      </template>
    </Variant>
  </Story>
</template>

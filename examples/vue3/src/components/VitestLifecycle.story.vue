<script lang="ts">
import { onTest } from 'histoire/client'
import { afterEach, aroundEach, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest'

let mountSequence = 0

// Module scope intentionally exercises the preview's first-import registration cache.
onTest(({ canvas }) => {
  let activeSuite = 0
  let activeTest = 0

  describe('lifecycle', () => {
    beforeAll(() => {
      activeSuite++
      return () => {
        activeSuite--
      }
    })
    beforeEach(() => {
      expect(activeTest).toBe(0)
      activeTest++
      return () => {
        activeTest--
      }
    })

    it('supports soft assertions against the rendered canvas', () => {
      expect.soft(canvas.querySelector('button')?.textContent).toContain('Call callback')
      expect.soft(activeSuite).toBe(1)
    })
    it('disposes resources between cases', () => {
      expect(activeTest).toBe(1)
    })
  })

  it('disposes suite resources before the next suite', () => {
    expect(activeSuite).toBe(0)
    expect(activeTest).toBe(0)
  })

  describe('completion lifecycle', () => {
    let suiteActive = false
    let testActive = false

    beforeAll(() => {
      suiteActive = true
      return () => {
        suiteActive = false
      }
    })
    aroundEach(async (runTest) => {
      testActive = true
      await runTest()
      testActive = false
    })
    afterEach(() => {
      expect(testActive).toBe(true)
    })

    it('keeps resources and canvas mounted through completion callbacks', () => {
      expect.assertions(1)
      expect(suiteActive).toBe(true)
      onTestFinished(() => {
        expect(testActive).toBe(true)
        expect(suiteActive).toBe(true)
        expect(canvas.isConnected).toBe(true)
      })
    })
  })
})
</script>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

// Function closure keeps this identity outside implicit state synchronization.
const readSetupId = (() => {
  const id = ++mountSequence
  return () => id
})()
const setupLabel = ref('initial')
onTest(({ canvas }) => {
  it('uses the setup closure belonging to the rendered canvas', async () => {
    expect(canvas.querySelector('[data-setup-id]')?.getAttribute('data-setup-id')).toBe(String(readSetupId()))
    setupLabel.value = 'changed by test'
    await nextTick()
    expect(canvas.querySelector('[data-setup-id]')?.textContent).toBe('changed by test')
  })
})

/** State includes a callback that must survive edits relayed through the host. */
function initState() {
  return {
    label: 'initial',
    result: '',
    items: [{ onClick: () => 'callback preserved' }],
  }
}
</script>

<template>
  <Story title="Vitest Lifecycle">
    <Variant :init-state="initState">
      <template #default="{ state }">
        <span :data-setup-id="readSetupId()">{{ setupLabel }}</span>
        <span data-test-id="runtime-label">{{ state.label }}</span>
        <button @click="state.result = state.items[0].onClick()">
          Call callback
        </button>
        <span data-test-id="callback-result">{{ state.result }}</span>
      </template>
      <template #controls="{ state }">
        <HstText
          v-model="state.label"
          title="Label"
        />
      </template>
    </Variant>
  </Story>
</template>

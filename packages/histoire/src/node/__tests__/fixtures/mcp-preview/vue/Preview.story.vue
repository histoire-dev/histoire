<script lang="ts">
import { vi } from 'vitest'
import { getGreeting } from './greeting'

vi.mock('./greeting', () => ({ getGreeting: vi.fn(() => 'Mocked greeting') }))
</script>

<script setup lang="ts">
const greeting = getGreeting()
</script>

<template>
  <Story id=".." title="MCP preview">
    <Variant id="a:/雪" title="Mocked preview">
      <div data-test-id="greeting">
        {{ greeting }}
      </div>
    </Variant>
  </Story>
</template>

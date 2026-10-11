<script setup lang="ts">
import { useHistoireGlobals } from '@histoire/shared'

const globals = useHistoireGlobals()
</script>

<template>
  <Story id="browser-setup" title="Browser setup consumer">
    <Variant id="normal">
      <div id="browser-setup-marker" class="marker" :style="{ backgroundColor: globals.theme === 'contrast' ? '#123456' : '#abcdef' }">
        {{ globals.theme }}
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.marker {
  position: fixed;
  inset: 0 auto auto 0;
  display: grid;
  width: 120px;
  height: 64px;
  place-items: center;
  color: white;
  font: 16px sans-serif;
}
</style>

<script setup lang="ts">
import { useHistoireGlobals } from '@histoire/shared'
import { onMounted } from 'vue'

const globals = useHistoireGlobals()
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const locale = Intl.DateTimeFormat().resolvedOptions().locale
const hour = new Date('2020-01-01T00:00:00Z').getHours()
onMounted(() => document.querySelector<HTMLInputElement>('[data-capture-input]')?.focus())
</script>

<template>
  <Story id="deterministic" title="Deterministic capture">
    <Variant id="normal">
      <div :data-theme="globals.theme" class="capture-root">
        <p data-capture-label>
          {{ timezone }}|{{ locale }}|{{ hour }}|{{ globals.theme }}
        </p>
        <div class="animated-box" />
        <input data-capture-input value="Focused caret">
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.capture-root { min-height: 100vh; color: #111; background: #fff; }
.capture-root[data-theme="contrast"] { color: #fff; background: #111; }
.animated-box { width: 50px; height: 50px; background: #123456; animation: moving 2s linear infinite; transition: width 2s; }
@keyframes moving { from { transform: translateX(0); } to { transform: translateX(200px); } }
</style>

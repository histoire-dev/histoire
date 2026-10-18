<script setup>
import { useMutationObserver } from '@vueuse/core'
import { logEvent } from 'histoire/client'
import { onMounted, ref } from 'vue'

const text = ref('Click me!')
/** Native Vuetify theme follows appearance owned by Histoire. */
const theme = ref('light')

/** Read host-applied class instead of creating another theme preference. */
function syncTheme() {
  theme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

onMounted(syncTheme)
useMutationObserver(() => globalThis.document?.documentElement, syncTheme, {
  attributes: true,
  attributeFilter: ['class'],
})
</script>

<template>
  <Story>
    <div class="example-stage">
      <v-btn
        :theme="theme"
        @click="logEvent('click', $event)"
      >
        {{ text }}
      </v-btn>
    </div>

    <template #controls>
      <HstText
        v-model="text"
        title="Default slot"
      />
    </template>
  </Story>
</template>

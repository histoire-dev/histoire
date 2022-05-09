<script lang="ts" setup>
import { reactive } from 'vue'
import HstText from '../text/HstText.vue'
import HstPresets from './HstPresets.vue'

const state = reactive({
  sample: 'Hello World',
})

</script>

<template>
  <Story
    title="HstPresets"
  >
    <HstPresets
      id="hst-preset"
      :state="state"
    />
    <HstText
      v-model="state.sample"
      title="Sample"
    />
  </Story>
</template>

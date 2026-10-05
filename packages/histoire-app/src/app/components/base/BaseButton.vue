<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  /** Existing router destination. */
  to?: any
  /** Existing native link destination. */
  href?: string
  /** Legacy primary/grey color mapping. */
  color?: string
}>()
const appearance = computed(() => props.color === 'primary' || !props.color ? 'primary' : props.color === 'flat' ? 'flat' : 'default')
</script>

<template>
  <RouterLink v-if="to" v-slot="{ href: destination, navigate }" :to="to" custom>
    <HstButton v-bind="$attrs" as="a" :href="destination" :color="appearance" class="histoire-base-button" @click="navigate">
      <slot />
    </HstButton>
  </RouterLink>
  <HstButton v-else v-bind="$attrs" :as="href ? 'a' : 'button'" :href="href" :color="appearance" class="histoire-base-button">
    <slot />
  </HstButton>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  framework: string
}>()

const allLinks = {
  vue3: {
    demo: 'https://vue3.examples.histoire.dev/',
    stackblitz: 'https://stackblitz.com/edit/histoire-vue3-starter',
  },
  nuxt3: {
    demo: '',
    stackblitz: 'https://stackblitz.com/edit/histoire-nuxt3-starter',
  },
  svelte3: {
    demo: 'https://svelte3.examples.histoire.dev/',
    stackblitz: 'https://stackblitz.com/edit/histoire-svelte3-starter',
  },
}

const links = computed(() => allLinks[props.framework])
</script>

<template>
  <div class="demo-links space-y-2">
    <a
      v-if="links.demo"
      :href="links.demo"
      target="_blank"
      class="btn flex items-center gap-4 p-4 hover:no-underline"
    >
      <img
        src="/logo.svg"
        alt="Logo"
        class="w-8 h-8"
      >
      Online demo
    </a>

    <a
      v-if="links.stackblitz"
      :href="links.stackblitz"
      target="_blank"
      class="btn-blue flex items-center gap-4 p-4 hover:no-underline"
    >
      <img
        src="/stackblitz.png"
        alt="Logo"
        class="w-8 h-8"
      >
      Try it in a live editor
    </a>
  </div>
</template>

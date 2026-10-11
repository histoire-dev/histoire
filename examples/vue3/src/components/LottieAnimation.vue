<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Async setup suspends story readiness until player and data are loaded.
const [{ default: lottie }, animationData] = await Promise.all([
  import('lottie-web'),
  fetch('/lottie-data.json').then(response => response.json()),
])

const el = ref<HTMLElement>()
let animation: ReturnType<typeof lottie.loadAnimation> | undefined

onMounted(() => {
  animation = lottie.loadAnimation({
    container: el.value!,
    renderer: 'svg',
    loop: true,
    // Reduced motion (visual captures) keeps first frame still.
    autoplay: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationData,
  })
})

onBeforeUnmount(() => animation?.destroy())
</script>

<template>
  <div ref="el" class="lottie-animation" />
</template>

<style scoped>
.lottie-animation {
  margin: auto;
  width: 90vw;
  height: 90vh;
  overflow: hidden;
}
</style>

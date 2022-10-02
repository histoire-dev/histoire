<script lang="ts" setup>
import { isCollecting } from 'histoire/client'
import { onMounted, ref } from 'vue'
const el = ref(null)
onMounted(async () => {
  if (isCollecting() || !el.value) return

  const { default: lottie } = await import('lottie-web')
  const animData = {
    container: el.value,
    animType: 'svg',
    loop: true,
    autoplay: true,
    path: '/lottie-data.json',
  }
  lottie.loadAnimation(animData)
})
</script>

<template>
  <Story>
    <div ref="el" />
  </Story>
</template>

<style scoped>
div {
  margin: auto;
  width: 90vw;
  height: 90vh;
  overflow: hidden;
}
</style>

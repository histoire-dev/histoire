<script setup lang="ts">
import { onMounted } from 'vue'

defineProps<{ tone: string }>()

const before = {
  cookie: document.cookie,
  storage: localStorage.getItem('histoire-reuse-sentinel') ?? '',
  html: document.documentElement.dataset.histoireReuse ?? '',
  body: document.body.dataset.histoireReuse ?? '',
}

onMounted(() => {
  document.cookie = 'histoire-reuse-sentinel=leaked; path=/; SameSite=Lax'
  localStorage.setItem('histoire-reuse-sentinel', 'leaked')
  document.documentElement.dataset.histoireReuse = 'leaked'
  document.body.dataset.histoireReuse = 'leaked'
})
</script>

<template>
  <div
    data-reuse-capture
    :data-tone="tone"
    :data-cookie-before="before.cookie"
    :data-storage-before="before.storage"
    :data-html-before="before.html"
    :data-body-before="before.body"
  >
    {{ tone }}
  </div>
</template>

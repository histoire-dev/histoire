<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { histoireConfig, customLogos } from '../util/config'
import HistoireLogo from '../assets/histoire.svg'
import { useStoryStore } from '../stores/story'
import StatCount from './app/StatCount.vue'

const logoUrl = computed(() => histoireConfig.theme?.logo?.square ? customLogos.square : HistoireLogo)
const storyStore = useStoryStore()

const stories = ref(0)
const variant = ref(0)
const docs = ref(0)

onMounted(updateCounts)

function updateCounts () {
  let storyCount = 0
  let variantCount = 0
  let docsCount = 0;

  (storyStore.stories || []).forEach(story => {
    storyCount++

    if (story.docsOnly) {
      docsCount++
    } else if (story.variants) {
      variantCount += story.variants.length
      docsCount += story.variants.filter(v => v.docsOnly).length
    }
  })

  stories.value = storyCount
  variant.value = variantCount
  docs.value = docsCount
}
</script>

<template>
  <div class="histoire-home-view htw-flex htw-flex-col htw-items-center htw-justify-center htw-h-full">
    <img
      :src="logoUrl"
      alt="Logo"
      class="htw-w-64 htw-h-64 htw-opacity-25 htw-mb-8 htw-hidden md:htw-block"
    >
    <div class="htw-flex htw-flex-wrap htw-justify-evenly htw-gap-2 md:htw-gap-4 htw-px-4">
      <stat-count
        title="Stories"
        icon="carbon:cube"
        :count="stories"
      />
      <stat-count
        title="Variants"
        icon="carbon:cube-view"
        :count="variant"
      />
      <stat-count
        title="Documents"
        icon="carbon:document-blank"
        :count="docs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { HstButton, useHistoireControls } from '@histoire/controls/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed } from 'vue'
import HistoireLogoDark from '../assets/histoire-text-dark.svg'
import HistoireLogoLight from '../assets/histoire-text.svg'
import { customLogos, histoireConfig } from '../util/config.js'

const props = defineProps<{ homeHref: string }>()
const emit = defineEmits<{ search: [], error: [error: unknown] }>()
const { session } = useHistoireContext()
const dark = useHistoireControls()!.dark
const logo = computed(() => dark.value ? customLogos.dark ?? HistoireLogoDark : customLogos.light ?? HistoireLogoLight)
/** Effective provider appearance includes system auto mode, without host document probing. */
function toggleDark() {
  void session.settings.update({ colorScheme: dark.value ? 'light' : 'dark' }).catch(error => emit('error', error))
}
</script>

<template>
  <header class="histoire-standalone-header">
    <a :href="histoireConfig.theme.logoHref ?? props.homeHref" :target="histoireConfig.theme.logoHref ? '_blank' : undefined">
      <img :src="logo" :alt="`${histoireConfig.theme.title} logo`">
    </a>
    <HstButton color="flat" type="button" aria-label="Search" data-test-id="search-btn" @click="emit('search')">
      Search
    </HstButton>
    <HstButton v-if="!histoireConfig.theme.hideColorSchemeSwitch" color="flat" type="button" aria-label="Toggle dark mode" @click="toggleDark">
      {{ dark ? 'Light' : 'Dark' }}
    </HstButton>
  </header>
</template>

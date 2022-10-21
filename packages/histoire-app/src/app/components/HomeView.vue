<script lang="ts" setup>
import { computed } from 'vue'
import { histoireConfig, customLogos } from '../util/config'
import HistoireLogo from '../assets/histoire.svg'

const logoUrl = computed(() => histoireConfig.theme?.logo?.square ? customLogos.square : HistoireLogo)
</script>

<template>
  <div class="histoire-home-view htw-flex htw-items-center htw-justify-center htw-h-full">
    <img
      :src="logoUrl"
      alt="Logo"
      class="htw-w-64 htw-h-64 htw-opacity-25"
    >
  </div>
</template>

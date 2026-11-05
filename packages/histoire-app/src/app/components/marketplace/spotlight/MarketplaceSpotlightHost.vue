<script setup lang="ts">
import SpotlightCard from './SpotlightCard.vue'
import { usePostInstallSpotlight } from './use-post-install-spotlight.js'

const { active, target, name, page, total, running, error, next, dismiss, openSettings, run } = usePostInstallSpotlight()
</script>

<template>
  <SpotlightCard v-if="active" :target="target" :name="name" :page="page" :total="total" :running="running" :error="error" @next="next" @dismiss="dismiss" @settings="openSettings" @run="run" />
</template>

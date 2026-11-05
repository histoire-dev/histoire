<script setup lang="ts">
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import MarketplaceAll from '../browse/MarketplaceAll.vue'
import MarketplaceDiscover from '../browse/MarketplaceDiscover.vue'
import MarketplaceDetail from '../detail/MarketplaceDetail.vue'
import MarketplaceInstall from '../install/MarketplaceInstall.vue'

const store = useMarketplaceStore()
</script>

<template>
  <MarketplaceDiscover v-if="store.view.value === 'discover'" />
  <MarketplaceAll v-else-if="store.view.value === 'all'" />
  <MarketplaceDetail v-else-if="store.view.value === 'detail'" />
  <MarketplaceInstall v-else />
</template>

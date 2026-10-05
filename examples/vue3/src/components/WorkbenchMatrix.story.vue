<script setup lang="ts">
import WorkbenchMatrix from './WorkbenchMatrix.vue'
</script>

<template>
  <Story title="Workbench matrix">
    <Variant id="default" title="Default">
      <WorkbenchMatrix />
    </Variant>
    <Variant id="alternate" title="Alternate">
      <WorkbenchMatrix message="Alternate preset" />
    </Variant>
  </Story>
</template>

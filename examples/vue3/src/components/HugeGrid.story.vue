<script lang="ts" setup>
import BaseButton from './BaseButton.vue'
import { count } from './huge-grid'
</script>

<template>
  <Story
    title="HugeGrid"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      v-for="n in count"
      :key="n"
      :title="`Variant ${n}`"
    >
      <BaseButton
        color="green"
        size="big"
      >
        Button {{ n }}
      </BaseButton>
    </Variant>
  </Story>
</template>

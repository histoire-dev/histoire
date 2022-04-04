<script lang="ts" setup>
import BaseButton from './BaseButton.vue'
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
      v-for="n in 1000"
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

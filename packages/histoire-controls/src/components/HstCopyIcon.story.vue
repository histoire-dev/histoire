<script lang="ts" setup>
import HstCopyIcon from './HstCopyIcon.vue'

function initState() {
  return {
    content: 'Text fo copy',
  }
}
</script>

<template>
  <Story
    title="internals/HstCopyIcon"
  >
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstCopyIcon
          :content="state.content"
        />
      </template>
    </Variant>
  </Story>
</template>

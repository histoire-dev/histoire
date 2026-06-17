<script lang="ts" setup>
const meta = { storyOptions: false }
</script>

<template>
  <Story
    title="StoryOptions Override"
    icon="carbon:no-image"
    :meta="meta"
  >
    <Variant>
      <p>This story sets <code>meta.storyOptions: false</code>, which forces the right pane hidden regardless of the global Layout setting.</p>
    </Variant>
  </Story>
</template>

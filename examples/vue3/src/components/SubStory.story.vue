<template>
  <Story
    title="Sub Folder/Meow/Sub Story 1"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant title="default">
      <p class="text">
        This is a sub story
      </p>
    </Variant>
  </Story>
</template>

<style scoped>
.text {
  color: var(--histoire-contrast-color);
}
</style>

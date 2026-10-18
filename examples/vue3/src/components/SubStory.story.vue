<template>
  <Story
    :meta="{ wrapper: false }"
    title="Sub Folder/Meow/Sub Story 1"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant title="default">
      <div class="example-stage example-stack">
        <p class="text">
          This is a sub story
        </p>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.text {
  color: var(--histoire-contrast-color);
}
</style>

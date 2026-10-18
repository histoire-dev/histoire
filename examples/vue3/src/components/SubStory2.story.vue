<template>
  <Story
    :meta="{ wrapper: false }"
    title="Sub Folder/Sub Story 2"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant title="default">
      <div class="example-stage example-stack">
        <p>This is a sub story</p>
      </div>
    </Variant>
  </Story>
</template>

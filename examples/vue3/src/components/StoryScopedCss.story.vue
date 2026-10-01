<template>
  <Story title="Story Scoped CSS">
    <Variant title="default">
      <div class="story-scoped-box">
        Blue scoped box
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.story-scoped-box {
  padding: 7px 11px;
  border: 3px solid rgb(59 130 246);
  border-radius: 5px;
}
</style>

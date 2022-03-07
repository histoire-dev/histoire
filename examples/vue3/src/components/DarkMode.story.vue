<template>
  <Story title="Dark mode">
    <Variant
      title="default"
    >
      <div class="meow">
        <span class="only-dark">Dark</span>
        Meow
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.dark .meow {
  color: #fff;
  font-size: 20px;
  font-weight: bold;
}

.only-dark {
  display: none;
}

.dark .only-dark {
  display: inline;
}
</style>

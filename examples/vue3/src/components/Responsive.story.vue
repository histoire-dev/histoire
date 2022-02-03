<template>
  <Story title="Responsive">
    <Variant
      title="default"
      iframe
    >
      <div class="target">
        Responsive
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
@media (max-width: 768px) {
  .target {
    background-color: rgb(236, 132, 132);
  }
}
</style>

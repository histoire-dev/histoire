<template>
  <div class="target">
    <p
      v-for="n in 100"
      :key="n"
    >
      Responsive
    </p>
  </div>
</template>

<style scoped>
.target p {
  margin: 2px;
  padding: 12px;
  background-color: rgb(188, 130, 255);
  color: black;
}

@media (max-width: 768px) {
  .target p {
    background-color: rgb(115, 255, 173);
  }
}
</style>

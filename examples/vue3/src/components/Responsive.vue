<template>
  <div class="example-responsive">
    <div v-for="n in 6" :key="n" class="example-region">
      {{ String(n).padStart(2, '0') }}
    </div>
  </div>
</template>

<template>
  <div class="htw-base-empty htw-flex htw-flex-col htw-items-center htw-justify-center htw-space-y-4 htw-py-12 htw-h-full htw-text-center htw-text-gray-400  htw-text-lg">
    <slot />
  </div>
</template>

<style scoped>
.htw-base-empty {
  animation: htw-base-empty .3s 1s both;
}

@keyframes htw-base-empty {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}
</style>

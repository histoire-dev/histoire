<template>
  <div>
    <div class="title">
      <slot name="title" />
    </div>
    <div class="content">
      <slot />
    </div>
    <div class="footer">
      <slot name="footer" />
    </div>
  </div>
</template>

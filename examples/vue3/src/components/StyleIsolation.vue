<script setup lang="ts">
</script>

<template>
  <div>
    <div class="my-button">
      Should have a blue border (cascade layer test)
    </div>

    <div class="user-card" style="margin-top: 16px;">
      <h3>User card</h3>
      <p>Background should be lime, border tomato dashed.</p>
      <p>Inherits <code>--user-primary</code> from <code>:root → :scope</code>.</p>
      <p>
        <a href="#">A wavy-underline tomato link</a>
      </p>
    </div>

    <p style="margin-top: 16px;">
      The wider page background should NOT be tomato — that rule
      is scoped to story containers only.
    </p>
  </div>
</template>

<style scoped>
@layer components {
    .my-button {
        border: 1px solid blue;
        background-color: transparent;
        color: blue;
    }
}
</style>

<script setup lang="ts">
import { Dropdown } from 'floating-vue'
import 'floating-vue/dist/style.css'
</script>

<template>
  <div class="user-card">
    <Dropdown>
      <button class="trigger">
        Open user dropdown
      </button>
      <template #popper>
        <div class="user-popper">
          <p>This dropdown is owned by the user.</p>
          <p>Background and font should follow user theme, not Histoire's.</p>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<style>
/*
 * User-side floating-vue restyling. Histoire's own popovers (toolbar menus)
 * use the same library — these rules must NOT leak into them.
 */
.v-popper--theme-dropdown .v-popper__inner {
  background: navy;
  color: lime;
  border: 3px solid tomato;
  border-radius: 0;
  font-family: monospace;
  padding: 12px;
}

.v-popper--theme-dropdown .v-popper__arrow-outer {
  border-color: navy;
}

.user-popper {
  min-width: 240px;
}

.trigger {
  background: lime;
  color: navy;
  border: 2px dashed tomato;
  padding: 8px 12px;
  font-weight: bold;
  cursor: pointer;
}
</style>

<script lang="ts" setup>
import { withDefaults } from 'vue'

withDefaults(defineProps<{
  look?: 'button' | 'link'
}>(), {
  look: 'button',
})
</script>

<template>
  <VDropdown>
    <button
      class="htw-inline-flex htw-items-center htw-gap-2"
      :class="{
        'htw-px-4 htw-py-2 htw-btn': look === 'button',
        'htw-border-none htw-bg-transparent htw-cursor-pointer htw-leading-6 htw-mt-[6px] htw-text-xl md:htw-text-sm': look === 'link',
      }"
    >
      <span>💚</span>
      <span
        :class="{
          'htw-hidden md:htw-inline': look === 'link',
        }"
      >Become a sponsor</span>
    </button>

    <template #popper>
      <div class="htw-p-2">
        <a
          href="https://github.com/sponsors/Akryum"
          target="_blank"
          class="htw-p-2 htw-pr-4 htw-flex htw-items-center htw-gap-4 htw-btn-flat"
        >
          <img
            src="https://avatars.githubusercontent.com/u/2798204?size=80"
            alt="Akryum avatar"
            class="htw-w-10 htw-h-10 htw-rounded-full"
          >
          Guillaume Chau
        </a>
        <a
          href="https://github.com/sponsors/hugoattal"
          target="_blank"
          class="htw-p-2 htw-pr-4 htw-flex htw-items-center htw-gap-4 htw-btn-flat"
        >
          <img
            src="https://avatars.githubusercontent.com/u/4563971?size=80"
            alt="Hugoattal avatar"
            class="htw-w-10 htw-h-10 htw-rounded-full"
          >
          Hugo Attal
        </a>
      </div>
    </template>
  </VDropdown>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
  look?: 'button' | 'link'
}>(), {
  look: 'button',
})
</script>

<template>
  <VDropdown>
    <button
      class="inline-flex items-center gap-2"
      :class="{
        'px-4 py-2 btn': look === 'button',
        'border-none bg-transparent cursor-pointer leading-6 mt-[6px] text-xl md:text-sm': look === 'link',
      }"
    >
      <span>💚</span>
      <span
        :class="{
          'hidden md:inline': look === 'link',
        }"
      >Become a sponsor</span>
    </button>

    <template #popper>
      <div class="p-2">
        <a
          href="https://github.com/sponsors/Akryum"
          target="_blank"
          class="p-2 pr-4 flex items-center gap-4 btn-flat"
        >
          <img
            src="https://avatars.githubusercontent.com/u/2798204?size=80"
            alt="Akryum avatar"
            class="w-10 h-10 rounded-full"
          >
          Guillaume Chau
        </a>
        <a
          href="https://github.com/sponsors/hugoattal"
          target="_blank"
          class="p-2 pr-4 flex items-center gap-4 btn-flat"
        >
          <img
            src="https://avatars.githubusercontent.com/u/4563971?size=80"
            alt="Hugoattal avatar"
            class="w-10 h-10 rounded-full"
          >
          Hugo Attal
        </a>
      </div>
    </template>
  </VDropdown>
</template>

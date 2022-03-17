<template>
  <div class="!xl:htw-hidden -htw-mx-32 htw-bg-gray-200 dark:htw-bg-gray-900 htw-p-2 htw-rounded-lg htw-h-[550px] htw-flex htw-flex-col htw-relative">
    <div class="htw-flex-none htw-h-4 htw-flex htw-gap-1 htw-justify-end">
      <div
        v-for="n in 3"
        :key="n"
        class="htw-w-2 htw-h-2 htw-rounded-full htw-bg-gray-400"
      />
    </div>

    <iframe
      src="https://vue3.examples.histoire.dev/"
      class="htw-w-full htw-h-full htw-border htw-border-none htw-rounded htw-bg-gray-200 dark:htw-bg-gray-900"
    />

    <div class="htw-absolute htw-bottom-4 htw-left-0 htw-w-full htw-flex htw-justify-center htw-pointer-events-none">
      <a
        v-tooltip="'Open demo in a new tab'"
        href="https://vue3.examples.histoire.dev/"
        target="_blank"
        class="htw-pointer-events-auto htw-flex htw-items-center htw-justify-center htw-w-16 htw-h-16 htw-rounded htw-bg-primary-500 hover:htw-bg-primary-400 htw-text-white"
      >
        <Icon
          icon="oi:fullscreen-enter"
          class="htw-w-6 htw-h-6"
        />
      </a>
    </div>
  </div>
</template>

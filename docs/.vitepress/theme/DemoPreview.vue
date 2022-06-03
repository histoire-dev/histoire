<template>
  <div class="!xl:hidden -mx-32 bg-gray-200 dark:bg-gray-900 p-2 rounded-lg h-[550px] flex flex-col relative">
    <div class="flex-none h-4 flex gap-1 justify-end">
      <div
        v-for="n in 3"
        :key="n"
        class="w-2 h-2 rounded-full bg-gray-400"
      />
    </div>

    <iframe
      src="https://vue3.examples.histoire.dev/"
      class="w-full h-full border border-none rounded bg-gray-200 dark:bg-gray-900"
    />

    <div class="absolute bottom-4 left-0 w-full flex justify-center pointer-events-none">
      <a
        v-tooltip="'Open demo in a new tab'"
        href="https://vue3.examples.histoire.dev/"
        target="_blank"
        class="pointer-events-auto flex items-center justify-center w-16 h-16 rounded bg-primary-500 hover:bg-primary-400 text-white"
      >
        <Icon
          icon="oi:fullscreen-enter"
          class="w-6 h-6"
        />
      </a>
    </div>
  </div>

  <a
    href="https://vue3.examples.histoire.dev/"
    target="_blank"
    class="xl:hidden btn flex items-center gap-4 p-4 hover:no-underline"
  >
    <img
      src="/logo.svg"
      alt="Logo"
      class="w-8 h-8"
    >
    Online demo
  </a>
</template>

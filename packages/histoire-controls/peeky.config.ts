import { defineConfig } from '@peeky/test'

export default defineConfig({
  runtimeEnv: 'dom',
  previewSetupFiles: [
    'src/peeky-preview.ts',
  ],
  vite: {
    resolve: {
      alias: {
        'floating-vue': 'floating-vue',
        '@iconify/vue': '@iconify/vue',
        pinia: 'pinia',
        'scroll-into-view-if-needed': 'scroll-into-view-if-needed',
        'vue-router': 'vue-router',
        '@vueuse/core': '@vueuse/core',
        vue: 'vue',
      },
    },
  },
})

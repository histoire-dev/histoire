import { defineConfig } from 'histoire';
import { HstVue } from '@histoire/plugin-vue';
import { HstNuxt } from '@histoire/plugin-nuxt';

export default defineConfig({
  plugins: [
    HstVue(),
    HstNuxt({ nuxtAppSettings: { include: '*' }}),
  ],
  setupFile: 'histoire.setup.ts',
});

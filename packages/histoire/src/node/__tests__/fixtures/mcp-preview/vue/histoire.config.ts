import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({ plugins: [HstVue()], storyMatch: ['*.story.vue'], theme: { defaultColorScheme: 'light', darkClass: 'fixture-dark', storeColorScheme: false }, backgroundPresets: [{ label: 'Fixture', color: '#e5f2ff', contrastColor: '#123' }] })

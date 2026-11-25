import { HstA11y } from '@histoire/plugin-a11y'
import { HstReact } from '@histoire/plugin-react'
import { defineConfig } from 'histoire'
import { referencePlugin } from 'histoire-example-plugin-reference'

/**
 * React support uses the same story lifecycle as other framework plugins. The reference
 * workbench plugin uses its Vue views: they run on the workbench's Vue, so this project
 * does not install `vue`.
 */
export default defineConfig({ plugins: [HstReact(), HstA11y(), referencePlugin({ ui: 'vue' })], setupFile: './src/histoire.setup.tsx', ui: { framePadding: 24 } })

import { HstReact } from '@histoire/plugin-react'
import { defineConfig } from 'histoire'

/** React support uses the same story lifecycle as other framework plugins. */
export default defineConfig({ plugins: [HstReact()], setupFile: './src/histoire.setup.tsx' })

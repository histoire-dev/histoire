import { defineConfig } from 'vite'

/** Native imports need no Histoire aliases, plugins, or document-wide CSS transforms. */
export default defineConfig({ css: { postcss: { plugins: [] } } })

import { defineConfig } from 'vite'

/** Ordinary host configuration; prevents parent repository CSS tools affecting this example. */
export default defineConfig({ css: { postcss: { plugins: [] } } })

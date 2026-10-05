import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** JSX transformation and Fast Refresh are provided by the consuming project. */
export default defineConfig({ plugins: [react()] })

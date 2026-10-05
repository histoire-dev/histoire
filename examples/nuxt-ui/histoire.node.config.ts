import { defineConfig } from 'histoire'
import config from './histoire.config'

export default defineConfig({ ...config, build: { target: 'node' } })

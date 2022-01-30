import { dirname, join } from 'pathe'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DIST_CLIENT_PATH = join(__dirname, '../client')
export const APP_PATH = join(DIST_CLIENT_PATH, 'app')

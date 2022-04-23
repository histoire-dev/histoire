import { dirname, join } from 'pathe'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DIST_PATH = join(__dirname, '../')
export const APP_PATH = join(DIST_PATH, 'client', 'app')

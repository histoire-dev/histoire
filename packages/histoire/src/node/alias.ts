import { createRequire } from 'node:module'
import path from 'pathe'

const require = createRequire(import.meta.url)

export const APP_PATH = path.join(path.dirname(require.resolve('@histoire/app/package.json')), process.env.HISTOIRE_DEV ? 'src' : 'dist')

export const TEMP_PATH = path.join(process.cwd(), 'node_modules', '.histoire')

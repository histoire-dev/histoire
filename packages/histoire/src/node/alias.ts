import { createRequire } from 'node:module'
import path from 'pathe'
import { resolveHistoireAppBundledDir } from './util/resolve-histoire-app.js'

const require = createRequire(import.meta.url)

export const APP_PATH = path.join(path.dirname(require.resolve('@histoire/app/package.json')), process.env.HISTOIRE_DEV ? 'src' : 'dist')

/**
 * Stylesheets every Histoire document loads: the app's own styles (source
 * entry in local Histoire development) and the bundled components' styles,
 * which the preview uses even when the host app runs from source.
 */
export function getHistoireStyleFiles() {
  return {
    style: path.join(APP_PATH, process.env.HISTOIRE_DEV ? 'app/style/main.pcss' : 'style.css'),
    bundledStyle: path.join(resolveHistoireAppBundledDir(), 'app.css'),
  }
}

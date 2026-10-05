import { normalizePath } from 'vite'

/** Font URLs resolve beside emitted dist/style.css in release and watch builds. */
export function toDist(file) {
  return normalizePath(file)
    .replace(/^src\/app\/style\/fonts\//, 'dist/fonts/')
    .replace(/^src\//, 'dist/')
}

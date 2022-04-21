import fs from 'fs-extra'
import { globbySync } from 'globby'
import { normalizePath } from 'vite'

function toDist (file) {
  return normalizePath(file).replace(/^src\//, 'dist/')
}

globbySync('src/client/**/*').forEach((file) => {
  if (file.endsWith('.ts') || file.endsWith('tsconfig.json')) return
  fs.copy(file, toDist(file))
})

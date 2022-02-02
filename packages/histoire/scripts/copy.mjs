import fs from 'fs-extra'
import { globbySync } from 'globby'
import { normalizePath } from 'vite'

function toDist (file) {
  return normalizePath(file).replace(/^src\//, 'dist/')
}

globbySync('src/client/**/!(*.ts|tsconfig.json)').forEach((file) => {
  fs.copy(file, toDist(file))
})

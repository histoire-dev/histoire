import chokidar from 'chokidar'
import fs from 'fs-extra'
import { toDist } from './asset-path.mjs'

// copy non ts files, such as an html or css, to the dist directory whenever
// they change.
chokidar
  .watch('src/**/!(*.ts|*.vue|tsconfig.json)')
  .on('change', file => fs.copy(file, toDist(file)))
  .on('add', file => fs.copy(file, toDist(file)))
  .on('unlink', file => fs.remove(toDist(file)))

// Fonts share controls source in development and production builds.
chokidar.watch('../histoire-controls/src/style/fonts').on('all', (event, file) => {
  const target = `dist/fonts/${file.split('/').pop()}`
  if (event === 'unlink') return fs.remove(target)
  if (event === 'add' || event === 'change') return fs.copy(file, target)
})

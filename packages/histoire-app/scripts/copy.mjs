import fs from 'fs-extra'
import { globbySync } from 'globby'
import { toDist } from './asset-path.mjs'

globbySync('src/**/*').forEach((file) => {
  if (file.endsWith('.vue') || file.endsWith('.ts') || file.endsWith('tsconfig.json')) return
  fs.copy(file, toDist(file))
})

// Shared controls own licensed fonts; app CSS resolves fonts beside its output.
await fs.copy('../histoire-controls/src/style/fonts', 'dist/fonts')

import fs from 'node:fs'
import { resolve } from 'pathe'

export function hasProjectVitest(root: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    return Boolean(
      packageJson.dependencies?.vitest
      || packageJson.devDependencies?.vitest,
    )
  }
  catch {
    return false
  }
}

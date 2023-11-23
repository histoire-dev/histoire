import path from 'pathe'
import fs from 'node:fs'

export function findUp (cwd: string = process.cwd(), fileNames: string[]): string {
  const { root } = path.parse(cwd)
  let dir = cwd

  if (root === '' && dir[1] === ':') {
    root = dir.substring(0, 2)
  }
  
  while (dir !== root) {
    for (const fileName of fileNames) {
      const searchPath = path.join(dir, fileName)
      if (fs.existsSync(searchPath)) {
        return searchPath
      }
    }
    dir = path.dirname(dir)
  }

  return null
}

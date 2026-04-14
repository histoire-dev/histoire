import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function resolveVitestPackageJson(root: string) {
  try {
    return require.resolve('vitest/package.json', {
      paths: [root],
    })
  }
  catch {
    return require.resolve('vitest/package.json')
  }
}

export function resolveVitestModule(root: string, id: string) {
  const vitestPackageJson = resolveVitestPackageJson(root)
  return createRequire(vitestPackageJson).resolve(id)
}

export function tryResolveVitestModule(root: string, id: string) {
  try {
    return resolveVitestModule(root, id)
  }
  catch {
    return null
  }
}

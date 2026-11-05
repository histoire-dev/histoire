import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { configTestProject } from '../utils/config-codemod.js'

/** Create installed package bytes; factories throw when inventory accidentally executes them. */
export async function inventoryPackage(root: string, name: string, version: string, extra: Record<string, unknown> = {}) {
  const directory = join(root, 'node_modules', name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs', ...extra }))
  await writeFile(join(directory, 'index.cjs'), 'throw new Error("inventory executed package code")')
}

/** Create project metadata alongside the shared config fixture. */
export async function inventoryProject(source = 'export default {}', dependencies: Record<string, string> = {}) {
  const fixture = await configTestProject(source)
  await writeFile(join(fixture.root, 'package.json'), JSON.stringify({ dependencies }))
  return fixture
}

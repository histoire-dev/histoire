import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const optionalBrowserPackages = ['playwright', 'playwright-core']

/** Build evidence needed to audit standalone runtime dependency graph. */
export interface NodeBundleResult {
  /** Every bundled input, retained only as build-time evidence. */
  inputs: string[]
  /** Builtins and optional browser imports remaining at deployment. */
  externalImports: string[]
}

/** Rejects project/dev tool packages from the immutable production runtime graph. */
function forbiddenImport(id: string): boolean {
  return /^(?:vite(?:\/|$)|vite-node(?:\/|$)|vitest(?:\/|$)|@vitest\/(?:runner|browser|browser-playwright)(?:\/|$)|@vue\/compiler|svelte\/compiler|vue(?:\/|$)|@histoire\/(?:sdk|vue|app|controls|vendors)(?:\/|$)|histoire(?:\/|$))/.test(id)
}

/** Checks relative or resolved paths that could bypass a package-name import guard. */
function forbiddenInput(id: string): boolean {
  const normalized = resolve(id).replace(/\\/g, '/')
  // These exact audited modules contain only policy validation and SDK-free
  // cleanup ownership. Their transitive inputs remain subject to every guard.
  if (/\/histoire\/(?:src|dist)\/node\/(?:config\/embed-built|runtime\/cleanup)\.[cm]?[jt]s$/.test(normalized)) return false
  return /\/node_modules\/(?:vite|vite-node|vitest|@vue\/compiler[^/]*|@vitest\/(?:runner|browser|browser-playwright))\//.test(normalized)
    || /\/histoire-(?:sdk|vue|app|controls|vendors)\/(?:src|dist)\//.test(normalized)
    || /\/histoire\/(?:src|dist)\/node\/(?:context|dev|index|load|stories|preview)\.[cm]?[jt]s$/.test(normalized)
    || /\/histoire\/(?:src|dist)\/node\/(?:config|collect|vite|story-collection|test)\//.test(normalized)
    || /\/histoire\/(?:src|dist)\/node\/runtime\/(?:start|controller|config-watchers|cleanup)\.[cm]?[jt]s$/.test(normalized)
}

/** Bundles a supplied production entry; never manufactures or publishes a placeholder server. */
export async function bundleNodeRuntime(entryFile: string, outputPath: string): Promise<NodeBundleResult> {
  const result = await build({
    entryPoints: [entryFile],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    metafile: true,
    write: false,
    logLevel: 'silent',
    external: optionalBrowserPackages,
    plugins: [{
      name: 'histoire-deployed-runtime-boundary',
      /** Restricts imports before esbuild follows forbidden development graphs. */
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          const absolute = importer && path.startsWith('.') ? resolve(dirname(importer), path) : path
          if (forbiddenImport(path) || forbiddenInput(absolute)) return { errors: [{ text: `Forbidden deployed runtime import: ${path}` }] }
        })
      },
    }],
  })
  const inputs = Object.keys(result.metafile.inputs)
  const forbidden = inputs.find(forbiddenInput)
  if (forbidden) throw new Error(`Forbidden deployed runtime input: ${forbidden}`)
  const externalImports = [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path)))]
  const unsupported = externalImports.find(id => !builtins.has(id) && !optionalBrowserPackages.some(name => id === name || id.startsWith(`${name}/`)))
  if (unsupported) throw new Error(`Unsupported external deployed runtime import: ${unsupported}`)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(outputPath, result.outputFiles[0].contents)
  return { inputs, externalImports }
}

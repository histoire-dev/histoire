import { pathToFileURL } from 'node:url'

/**
 * Dynamically imports a module from a `require.resolve`-style absolute file
 * path. Node's ESM loader rejects raw absolute paths on Windows
 * (`ERR_UNSUPPORTED_ESM_URL_SCHEME`: "absolute paths must be valid file://
 * URLs"), so the path must be converted before importing.
 * @param resolvedPath Absolute file path returned by a resolver.
 */
export function importResolvedModule<T = any>(resolvedPath: string): Promise<T> {
  return import(pathToFileURL(resolvedPath).href) as Promise<T>
}

/**
 * Retain published Vue module paths when Rolldown strips their source extension.
 * @param {{ facadeModuleId: string | null }} chunk Preserved module being emitted.
 * @returns {string} File name pattern shared by app and embed builds.
 */
export function moduleFileName(chunk) {
  return chunk.facadeModuleId?.endsWith('.vue') ? '[name].vue.js' : '[name].js'
}

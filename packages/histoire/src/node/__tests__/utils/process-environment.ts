/** Clean child environment cannot borrow optional peers from repository runner shims; browser launching stays disabled unless the caller names a launcher. */
export function createPackageProcessEnvironment(environment: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...environment, BROWSER: environment.BROWSER ?? 'none' }
  // pnpm injects NODE_PATH; external consumers must resolve their own packages.
  delete env.NODE_PATH
  delete env.NODE_OPTIONS
  if (!environment.HISTOIRE_MCP_TOKEN) delete env.HISTOIRE_MCP_TOKEN
  return env
}

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// Boundary: the published `histoire` bin running `dev` in a real Node process, with a
// resolution hook recording the true module graph and `listen` stopping the process at
// the first bind. Defect: bin wiring, the `@histoire/cli` entry, terminal modules or the
// injected inputs (including the calls made on them) pulling runtime, Vite, project or
// workbench-route code into the graph loaded before the port binds.
it('loads only the dev parent and its injected inputs before the public port binds', () => {
  const bin = new URL('../../../../bin.mjs', import.meta.url).href
  const script = `
    import { registerHooks } from 'node:module'
    import { Server } from 'node:net'
    const seen = []
    registerHooks({ resolve(specifier, context, next) { const result = next(specifier, context); seen.push(result.url); return result } })
    // First bind ends the run: everything resolved so far loaded before the port was bound.
    Server.prototype.listen = function () {
      process.stdout.write('\\n@@modules ' + JSON.stringify(seen) + '\\n', () => process.exit(0))
      return this
    }
    process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(bin))}, 'dev', '--port', '0', '--host', '127.0.0.1', '--no-mcp', '--no-tui']
    await import(${JSON.stringify(bin)})
  `
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8' })
  const resolved: string[] = JSON.parse(output.slice(output.indexOf('@@modules ') + '@@modules '.length))
  expect(resolved.some(url => url.includes('/histoire-cli/dist/terminal/bridge.js'))).toBe(true)
  expect(resolved.filter(url => /\/dist\/node\/(?:runtime|server|context|collect)|\/node_modules\/(?:\.pnpm\/)?vite[@/]|\/histoire-dev-proxy\/dist\/config\/|\/histoire-protocol\/|\/histoire-cli\/dist\/workbench-url\.js/.test(url))).toEqual([])
  // Histoire itself may only add its bin, the injection and the MCP credential and option helpers.
  const histoireModules = resolved.filter(url => url.includes('/histoire/dist/node/')).map(url => url.slice(url.indexOf('/dist/node/')))
  expect([...new Set(histoireModules)].sort()).toEqual(['/dist/node/bin.js', '/dist/node/commands/dev-host.js', '/dist/node/mcp/transport/http-auth.js', '/dist/node/mcp/transport/http-options.js'])
})

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'

let server
let settings
let descendant
let fresh = false
let origin
let located
/** Responses the `/hold` route keeps open until `/release`. */
const pending = []
/** Test peer obeys actual process protocol and serves its PID as observable identity. */
async function start(message) {
  const config = JSON.parse(await readFile(join(process.cwd(), 'histoire.config.ts'), 'utf8'))
  settings = config
  fresh = message.options?.fresh === true
  if (config.output) {
    process.stdout.write('fixture-out ')
    process.stdout.write('line\n')
    process.stderr.write('fixture-err\n')
  }
  if (config.address) {
    origin = await new Promise((resolve) => {
      located = resolve
      process.send({ type: 'address', generation: message.generation, ...config.address })
    })
  }
  if (config.gate) await fetch(config.gate)
  if (config.descendant) {
    const peer = spawn(process.execPath, ['--input-type=module', '-e', `import{createServer}from'node:http';const server=createServer((_,response)=>response.end('alive'));server.listen(0,'127.0.0.1',()=>process.send(server.address().port));setInterval(()=>{},1000)`], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    descendant = await new Promise(resolve => peer.once('message', port => resolve(`http://127.0.0.1:${port}`)))
  }
  server = createServer((request, response) => {
    if (request.url === '/echo') {
      request.pipe(response)
      return
    }
    if (request.url.startsWith('/hold')) {
      pending.push(response)
      return
    }
    if (request.url === '/release') {
      for (const waiting of pending.splice(0)) waiting.end('late')
      response.end('released')
      return
    }
    if (request.url === '/boom') {
      request.socket.destroy()
      return
    }
    if (request.url === '/stream') {
      response.write('first chunk')
      response.once('close', () => {
        void writeFile(join(process.cwd(), 'stream-closed'), 'closed')
      })
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ value: config.value, pid: process.pid, descendant, fresh, origin }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.send({ type: 'ready', generation: message.generation, target: `http://127.0.0.1:${server.address().port}`, base: '/' })
}
let held
process.on('message', (message) => {
  if (message.type === 'runtime-command') {
    const base = { generation: message.generation, id: message.id }
    // `hold` is answered only while the runtime is being wound down.
    if (message.operation === 'hold') held = base
    // Mirrors a runtime asking its parent for a full process replacement.
    else if (message.operation === 'request-restart') process.send({ type: 'restart', generation: message.args?.generation ?? message.generation, source: message.args.source, fresh: message.args.fresh })
    else process.send({ type: 'runtime-reply', ...base, ok: true, result: { pid: process.pid, args: message.args } })
    return
  }
  if (message.type === 'address') located?.(message.publicOrigin)
  if (message.type === 'start') void start(message).catch(error => process.send({ type: 'failed', generation: message.generation, error: error.message }))
  if (message.type === 'shutdown') {
    if (settings?.hang) return
    if (held) {
      process.send({ type: 'runtime-reply', ...held, ok: true, result: 'late' }, () => process.disconnect())
      server?.closeAllConnections()
      server?.close()
      return
    }
    server?.closeAllConnections()
    server?.close()
    process.disconnect()
  }
})

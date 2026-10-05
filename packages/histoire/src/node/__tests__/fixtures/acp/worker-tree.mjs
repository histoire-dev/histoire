import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Controlled worker ignores graceful stop to prove whole-group escalation. */
if (process.argv[2] === 'worker') {
  process.on('SIGTERM', () => {})
  process.send?.('ready')
  setInterval(() => {}, 1000)
}
else {
  const inherited = process.argv[2] === 'inherited'
  const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), 'worker'], { stdio: ['ignore', inherited ? 'inherit' : 'ignore', inherited ? 'inherit' : 'ignore', 'ipc'] })
  worker.once('message', () => process.stdout.write(`${worker.pid}\n`))
  process.on('SIGTERM', () => process.exit(0))
  setInterval(() => {}, 1000)
}

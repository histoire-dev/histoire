import { Buffer } from 'node:buffer'
// Runtime peer speaking the private proxy protocol. Emits awkward output
// (split UTF-8, carriage returns, oversized and unterminated lines) and answers
// commands; `hold` is answered only while the process is being wound down.
let held
const send = (message, callback) => process.send(message, callback)

process.on('message', async (message) => {
  if (message.type === 'start') {
    const bytes = Buffer.from('smile 😀 end\n')
    const split = bytes.indexOf(0xF0) + 2
    process.stdout.write(bytes.subarray(0, split))
    await new Promise(resolve => setTimeout(resolve, 20))
    process.stdout.write(bytes.subarray(split))
    process.stdout.write('10%\r100%\n')
    process.stdout.write(`${'a'.repeat(40_000)}\nafter big\n`)
    process.stderr.write('\x1B[31mfailure\x1B[0m\n')
    process.stdout.write('unterminated')
    send({ type: 'ready', generation: message.generation, target: 'http://127.0.0.1:9', base: '/' })
    send({ type: 'runtime-event', generation: message.generation, event: 'log', data: { level: 'warn', text: 'from console' } })
  }
  if (message.type === 'runtime-command') {
    const base = { generation: message.generation, id: message.id }
    if (message.operation === 'hold') held = base
    else send({ type: 'runtime-reply', ...base, ok: true, result: { echo: message.args } })
  }
  if (message.type === 'shutdown') {
    if (held) send({ type: 'runtime-reply', ...held, ok: true, result: 'late' }, () => process.disconnect())
    else process.disconnect()
  }
})

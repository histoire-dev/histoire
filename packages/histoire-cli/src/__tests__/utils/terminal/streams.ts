import { PassThrough, Writable } from 'node:stream'
import { createScreenEmulator } from './screen.js'

/** In-memory terminal: TTY-like stdin with raw mode, and a stdout feeding an emulator. */
export function createFakeTerminal(options: { columns?: number, rows?: number, tty?: boolean } = {}) {
  const tty = options.tty ?? true
  const stdin = Object.assign(new PassThrough(), { isTTY: tty, isRaw: false, setRawMode(mode: boolean) {
    stdin.isRaw = mode
    return stdin
  } }) as unknown as NodeJS.ReadStream & PassThrough
  const written: string[] = []
  let screen = createScreenEmulator(options.columns ?? 80, options.rows ?? 24)
  const stdout = Object.assign(new Writable({ write(chunk, _encoding, done) {
    const text = chunk.toString()
    written.push(text)
    screen.write(text)
    done()
  } }), { isTTY: tty, columns: options.columns ?? 80, rows: options.rows ?? 24 }) as unknown as NodeJS.WriteStream & Writable
  return {
    stdin,
    stdout,
    /** Screen as the user sees it. */
    screen: () => screen,
    /** Raw written text, for control sequence assertions. */
    output: () => written.join(''),
    /** Types text as the user would. */
    type: (text: string) => stdin.write(text),
    /** Changes the size and emits `resize`; the emulator restarts with the new size and a blank screen. */
    resize(columns: number, rows: number) {
      Object.assign(stdout, { columns, rows })
      screen = createScreenEmulator(columns, rows)
      stdout.emit('resize')
    },
  }
}

import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Confirms native ESM import in an owned fresh Node process with no listener side effects. */
export async function validateNodeBundleImport(outputPath: string): Promise<void> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', 'await import(process.argv[1])', pathToFileURL(outputPath).href], { stdio: ['ignore', 'ignore', 'pipe'] })
  let diagnostic = ''
  child.stderr.on('data', (chunk: Buffer) => {
    if (diagnostic.length < 4096) diagnostic += chunk.toString().slice(0, 4096 - diagnostic.length)
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 10000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(signal ? 'Node runtime bundle did not exit after import' : `Node runtime bundle import failed: ${diagnostic.trim()}`))
    })
  })
}

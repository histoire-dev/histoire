const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Executes scripted external package-manager behavior against a scratch project. */
async function main() {
  const root = process.cwd()
  const script = JSON.parse(fs.readFileSync(path.join(root, 'manager.json'), 'utf8'))
  const calls = path.join(root, 'manager-calls.jsonl')
  fs.appendFileSync(calls, `${JSON.stringify({ argv: process.argv.slice(2), ci: process.env.CI })}\n`)
  if (process.argv[2] === '--version') {
    fs.writeSync(1, `${script.berryVersion ? '4.0.0' : '1.22.22'}\n`)
    return
  }
  const resync = process.argv[2] === 'ci' || process.argv.includes('--frozen-lockfile') || process.argv.includes('--immutable') || process.argv.includes('--no-save')
  const directory = path.join(root, 'node_modules/test-plugin')
  if (resync) {
    fs.writeSync(1, 'Repair https://user:secret@example.com/pkg?token=hidden\n')
    if (script.repairSleep) {
      setInterval(() => fs.appendFileSync(path.join(root, 'repair-heartbeat'), 'x'), 30)
      fs.writeSync(1, 'repair waiting\n')
      await new Promise(() => {})
    }
    fs.writeFileSync(path.join(root, script.lockfile ?? 'pnpm-lock.yaml'), 'repair touched lock\n')
    fs.writeFileSync(path.join(root, 'package.json'), '{"repair":"touched manifest"}\n')
    if (script.resyncFailure) process.exit(1)
    if (!script.repairNoop) {
      fs.rmSync(directory, { recursive: true, force: true })
      if (script.installedVersion) {
        fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'test-plugin', version: script.repairVersion ?? script.installedVersion, main: 'index.cjs' }))
        fs.writeFileSync(path.join(directory, 'index.cjs'), 'exports.TestPlugin = () => ({ name: "test-plugin" })')
      }
    }
    return
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"devDependencies":{"test-plugin":"^1.2.3"}}\n')
  fs.writeFileSync(path.join(root, script.lockfile ?? 'pnpm-lock.yaml'), 'changed lock\n')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'test-plugin', version: '1.2.3', main: 'index.cjs', peerDependencies: script.peers, peerDependenciesMeta: script.peersMeta }))
  fs.writeFileSync(path.join(directory, 'index.cjs'), script.badConfig ? 'exports.TestPlugin = () => { throw new Error("broken factory") }' : `exports.TestPlugin = () => ({ name: ${JSON.stringify(script.required ? 'builtin:test' : 'test-plugin')} })`)
  if (['remove', 'uninstall'].includes(process.argv[2])) fs.rmSync(directory, { recursive: true, force: true })
  fs.writeSync(1, '\x1B[32mInstalled https://user:secret@example.com/pkg?token=hidden\x1B[0m\n')
  if (script.output) fs.writeSync(1, script.output)
  if (script.sleep) {
    const child = spawn(process.execPath, ['-e', `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); setInterval(()=>fs.appendFileSync(${JSON.stringify(path.join(root, 'heartbeat'))}, 'x'),30)`], { stdio: 'ignore' })
    fs.writeFileSync(path.join(root, 'worker-pid'), String(child.pid))
    fs.writeSync(1, 'waiting\n')
    await new Promise(() => {})
  }
  if (script.fail) {
    fs.writeSync(2, script.fail)
    process.exit(1)
  }
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})

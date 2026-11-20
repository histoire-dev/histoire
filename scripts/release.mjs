import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { release } from '@akryum/sheep'
import { writeOfficialIndex } from './marketplace/generate-official-index.mjs'
import { snapshotOfficialHistory } from './marketplace/snapshot-official-history.mjs'

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean' },
    'tag': { type: 'string' },
    'debug': { type: 'boolean' },
  },
})

/** Run release commands with inherited output and stop on nonzero exit. */
function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

/** Return changed release inputs without staging unrelated files. */
function releaseFiles() {
  const allowed = /^(?:package\.json|pnpm-lock\.yaml|CHANGELOG\.md|packages\/[^/]+\/(?:package\.json|marketplace-history\.json)|packages\/histoire\/src\/node\/marketplace\/catalog\/official\.json)$/
  const paths = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  if (paths.some(path => !allowed.test(path))) throw new Error('Unexpected tracked changes during release preparation')
  return paths
}

/** Reuse Sheep for interactive versioning and changelog, then validate the exact publish inputs. */
async function main() {
  await release({ expectedBranch: 'main', dryRun: true, force: true, debug: values.debug, distTag: values.tag })
  if (process.exitCode) return

  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const tag = `v${version}`
  if (execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim()) throw new Error(`Release tag already exists: ${tag}`)

  await snapshotOfficialHistory()
  await writeOfficialIndex()
  run('pnpm', ['run', 'lint'])
  run('pnpm', ['run', 'build'])
  run('pnpm', ['run', 'test'])

  const files = releaseFiles()
  if (values['dry-run']) return

  run('pnpm', ['publish', '-r', '--no-git-checks', ...values.tag ? ['--tag', values.tag] : []])
  run('git', ['add', '--', ...files])
  run('git', ['commit', '-m', `chore(release): ${tag}`])
  run('git', ['tag', tag])
  run('git', ['push'])
  run('git', ['push', 'origin', 'tag', tag])
}

await main()

import type { Context } from '../context.js'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { join } from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { collectWorkbenchBuildInfo } from '../virtual/build-info.js'

const execute = promisify(execFile)

/** Minimal input isolates public metadata from project plugin execution. */
function context(mode: 'dev' | 'build' = 'build', changedSince?: string): Context {
  return {
    root: '/project',
    mode,
    config: { build: { changedSince } },
    storyFiles: [{ relativePath: 'Button.story.vue', story: { id: 'button' } }, { relativePath: 'New.story.vue', story: { id: 'new' } }],
  } as Context
}

describe('workbench build metadata', () => {
  it('keeps static metadata useful when package and git are unavailable', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('unavailable'))
    expect(await collectWorkbenchBuildInfo(context(), { readPackage: fail, git: fail, now: () => '2026-10-03T00:00:00Z' })).toEqual({ builtAt: '2026-10-03T00:00:00Z' })
  })

  it('projects requested git changes onto known stories without leaking file paths', async () => {
    const git = vi.fn(async (args: string[]) => args[0] === 'diff' ? 'M\0Button.story.vue\0A\0New.story.vue\0M\0.env\0' : args.includes('--show-prefix') ? '' : args.includes('--abbrev-ref') ? 'main\n' : '123abc\n')
    const info = await collectWorkbenchBuildInfo(context('build', 'v1.0'), { readPackage: async () => ({ version: '2.0' }), git, now: () => 'now' })
    expect(info).toEqual({ version: '2.0', commit: '123abc', branch: 'main', builtAt: 'now', changed: [{ storyId: 'button', kind: 'changed' }, { storyId: 'new', kind: 'new' }] })
    expect(git).toHaveBeenCalledWith(['diff', '--name-status', '-z', 'v1.0', '--', '.'])
  })

  it('parses dev filenames containing spaces and keeps generation timestamp stable', async () => {
    const ctx = context('dev')
    ctx.storyFiles[0].relativePath = 'My Button.story.vue'
    const git = vi.fn(async (args: string[]) => args[0] === 'status' ? ' M My Button.story.vue\0?? New.story.vue\0' : '')
    const now = vi.fn(() => 'first')
    const options = { readPackage: async () => ({}), git, now }
    expect((await collectWorkbenchBuildInfo(ctx, options)).changed).toEqual([{ storyId: 'button', kind: 'changed' }, { storyId: 'new', kind: 'new' }])
    expect((await collectWorkbenchBuildInfo(ctx, options)).builtAt).toBe('first')
    expect(git).toHaveBeenCalledWith(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
    expect(now).toHaveBeenCalledTimes(1)
  })

  it('projects nested Git rename and addition paths onto project-relative stories', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'histoire-build-info-'))
    const root = join(repository, 'packages/book space')
    /** Run real fixture commands without changing process cwd or global Git settings. */
    const git = async (...args: string[]) => execute('git', args, { cwd: repository })
    try {
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'package.json'), '{"version":"3.0"}')
      await writeFile(join(root, 'Old Button.story.vue'), '<Story title="Button" />\n')
      await writeFile(join(repository, 'Outside.story.vue'), '<Story title="Outside" />\n')
      await git('init', '--quiet')
      await git('config', 'diff.renames', 'true')
      await git('add', '.')
      await git('-c', 'user.name=Histoire test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture')
      const renamed = 'My Button\n.story.vue'
      await git('mv', '--', 'packages/book space/Old Button.story.vue', `packages/book space/${renamed}`)
      await writeFile(join(root, 'New.story.vue'), '<Story title="New" />\n')
      await writeFile(join(repository, 'Outside.story.vue'), '<Story title="Outside changed" />\n')
      const ctx = context('dev')
      ctx.root = root
      ctx.storyFiles[0].relativePath = renamed
      const changed = [{ storyId: 'button', kind: 'changed' }, { storyId: 'new', kind: 'new' }]
      expect((await collectWorkbenchBuildInfo(ctx)).changed).toEqual(changed)
      await git('add', '--', 'packages/book space/New.story.vue')
      const built = { ...ctx, mode: 'build', config: { build: { changedSince: 'HEAD' } } } as Context
      expect((await collectWorkbenchBuildInfo(built)).changed).toEqual(changed)
    }
    finally {
      await rm(repository, { recursive: true, force: true })
    }
  })
})

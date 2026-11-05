import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveNpmConfig } from '../../marketplace/catalog/npm-config.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'

beforeEach(async () => {
  const { root } = await configTestProject()
  vi.stubEnv('HOME', root)
  vi.stubEnv('npm_config_userconfig', join(root, '.npmrc'))
  vi.stubEnv('npm_config_registry', '')
  vi.stubEnv('NPM_CONFIG_REGISTRY', '')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

// Real config resolver reads isolated files. Distinct registries expose reversed
// precedence, lost scope settings, and accidental inheritance outside workspaces.
describe('npm registry settings', () => {
  it('merges env, project, workspace and user settings in precedence order', async () => {
    const { root: workspace } = await configTestProject()
    const root = join(workspace, 'packages/book')
    await mkdir(root, { recursive: true })
    await writeFile(join(workspace, 'package.json'), '{"workspaces":["packages/*"]}')
    await writeFile(join(process.env.HOME!, '.npmrc'), 'registry=https://user.example/\n@user:registry=https://user-scope.example/')
    await writeFile(join(workspace, '.npmrc'), 'registry=https://workspace.example/\n@team:registry=https://workspace.example/team/')
    await writeFile(join(root, '.npmrc'), 'registry=https://project.example/base/\n@acme:registry=https://project.example/acme/')
    const project = await resolveNpmConfig(root)
    expect(project.registryFor('plugin')).toBe('https://project.example/base/')
    expect(project.registryFor('@acme/plugin-x')).toBe('https://project.example/acme/')
    expect(project.registryFor('@team/plugin')).toBe('https://workspace.example/team/')
    expect(project.registryFor('@user/plugin')).toBe('https://user-scope.example/')
    vi.stubEnv('NPM_CONFIG_REGISTRY', 'https://upper.example/')
    vi.stubEnv('npm_config_registry', 'https://env.example/')
    vi.stubEnv('npm_config_@acme:registry', 'https://env.example/acme/')
    const env = await resolveNpmConfig(root)
    expect(env.registryFor('plugin')).toBe('https://env.example/')
    expect(env.registryFor('@acme/plugin-x')).toBe('https://env.example/acme/')
    const override = await resolveNpmConfig(root, 'https://fixture.example/')
    expect(override.registryFor('@acme/plugin-x')).toBe('https://fixture.example/')
  })

  it('uses explicit userconfig and never reads unrelated ancestor npmrc', async () => {
    const { root: parent } = await configTestProject()
    const root = join(parent, 'book')
    await mkdir(root)
    await writeFile(join(parent, '.npmrc'), 'registry=https://foreign.example/')
    await writeFile(join(process.env.HOME!, '.npmrc'), 'registry=https://home.example/')
    const userconfig = join(parent, 'custom.npmrc')
    await writeFile(userconfig, 'registry=https://custom.example/')
    vi.stubEnv('npm_config_userconfig', userconfig)
    expect((await resolveNpmConfig(root)).registryFor('plugin')).toBe('https://custom.example/')
    vi.stubEnv('npm_config_userconfig', '')
    expect((await resolveNpmConfig(root)).registryFor('plugin')).toBe('https://home.example/')
  })

  it('overrides credentials with env and leaves missing or incomplete credentials unset', async () => {
    const { root } = await configTestProject()
    await writeFile(join(process.env.HOME!, '.npmrc'), '//private.example/:_authToken=user-token')
    await writeFile(join(root, '.npmrc'), '//private.example/:_authToken=project-token\n//incomplete.example/:username=alice')
    const url = 'http://private.example/plugin'
    expect((await resolveNpmConfig(root)).authorizationFor(url)).toBe('Bearer project-token')
    vi.stubEnv('npm_config_//private.example/:_authToken', 'env-token')
    expect((await resolveNpmConfig(root)).authorizationFor(url)).toBe('Bearer env-token')
    vi.stubEnv('MARKETPLACE_MISSING', undefined)
    vi.stubEnv('npm_config_//private.example/:_authToken', `\${MARKETPLACE_MISSING}`)
    const missing = await resolveNpmConfig(root)
    expect(missing.authorizationFor(url)).toBeUndefined()
    expect(missing.authorizationFor('https://incomplete.example/plugin')).toBeUndefined()
  })

  it('expands env values, supports Basic auth, and chooses longest credential path', async () => {
    const { root } = await configTestProject()
    vi.stubEnv('MARKETPLACE_REGISTRY', 'https://private.example/team/')
    vi.stubEnv('MARKETPLACE_TOKEN', 'path-token')
    vi.stubEnv('MARKETPLACE_MISSING', undefined)
    await writeFile(join(root, '.npmrc'), [
      `registry=\${MARKETPLACE_REGISTRY}`,
      '//private.example/:_auth=cm9vdDpwYXNz',
      `//private.example/team/:_authToken="\${MARKETPLACE_TOKEN}"`,
      `//private.example/missing/:_authToken=\${MARKETPLACE_MISSING}`,
      '//private.example/basic/:username=alice',
      `//private.example/basic/:_password=${Buffer.from('password').toString('base64')}`,
      '//private.example/incomplete/:username=alice',
      `//other.example/:_authToken=\${MARKETPLACE_MISSING}`,
      'unknown-key=ignored',
    ].join('\n'))
    const config = await resolveNpmConfig(root)
    expect(config.registryFor('plugin')).toBe('https://private.example/team/')
    expect(config.authorizationFor('https://private.example/team/pkg')).toBe('Bearer path-token')
    expect(config.authorizationFor('https://private.example/team-other/pkg')).toBe('Basic cm9vdDpwYXNz')
    expect(config.authorizationFor('https://private.example/basic/pkg')).toBe('Basic YWxpY2U6cGFzc3dvcmQ=')
    expect(config.authorizationFor('https://other.example/pkg')).toBeUndefined()
    expect(config.authorizationFor('https://private.example:8443/team/pkg')).toBeUndefined()
    expect(config.authorizationFor('https://private.example.evil/team/pkg')).toBeUndefined()
  })

  it.each(['secret-\0-control', 'secret-\u0100-unicode'])('leaves invalid HTTP credentials unset: %s', async (token) => {
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), `//private.example/:_authToken=${token}`)
    expect((await resolveNpmConfig(root)).authorizationFor('https://private.example/plugin')).toBeUndefined()
  })

  it('preserves repeated slashes in registry and credential path boundaries', async () => {
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), 'registry=https://private.example/team//\n//private.example/team//:_authToken=double-slash-token')
    const config = await resolveNpmConfig(root)
    expect(config.registryFor('plugin')).toBe('https://private.example/team//')
    expect(config.authorizationFor('https://private.example/team/plugin')).toBeUndefined()
    expect(config.authorizationFor('https://private.example/team//plugin')).toBe('Bearer double-slash-token')
  })

  it.each(['https://user:secret@registry.example/', 'file:///tmp/registry', 'https://registry.example/?token=secret', `\${MISSING_REGISTRY}`])('rejects unsafe registry %s without exposing it', async (registry) => {
    const { root } = await configTestProject()
    await writeFile(join(root, '.npmrc'), `registry=${registry}`)
    await expect(resolveNpmConfig(root)).rejects.toThrow('Invalid registry URL')
    await expect(resolveNpmConfig(root)).rejects.not.toThrow('secret')
  })
})

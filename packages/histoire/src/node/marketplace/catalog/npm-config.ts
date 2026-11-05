import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'pathe'
import { findWorkspaceRoot } from '../changes/package-manager.js'
import { packageName } from './validation.js'

/** Resolved registry routing with credentials kept inside server-only closures. */
export interface NpmRegistryConfig {
  /** Select the scoped registry or the default registry; always ends in a slash. */
  registryFor: (id?: string) => string
  /** Select authorization only for an exact host and credential path prefix. */
  authorizationFor: (url: string) => string | undefined
}
/** One nerf-dart credential scope with independent npm auth settings. */
interface Credential {
  /** Normalized host including port and path ending in a slash. */ prefix: string
  /** Bearer token, preferred over Basic credentials. */ token?: string
  /** Pre-encoded Basic authorization payload. */ auth?: string
  /** Username used with a base64-encoded password. */ username?: string
  /** npm base64-encoded password. */ password?: string
}

/** Expand npm-style environment references without exposing unresolved secrets. */
function expand(value: string): string | undefined {
  let missing = false
  const expanded = value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    if (process.env[name] === undefined) missing = true
    return process.env[name] ?? ''
  })
  return missing ? undefined : expanded
}

/** Accept only settings supported by this read-only npm client. */
function settingKey(key: string): string | undefined {
  if (/^(?:registry|@[^/:\s]+:registry)$/i.test(key)) return key.toLowerCase()
  const match = /^(\/\/\S+\/):(_authToken|_auth|username|_password)$/i.exec(key)
  return match ? `${match[1]}:${match[2].toLowerCase()}` : undefined
}

/** Parse the supported npmrc subset, including comments and quoted values. */
function readSettings(source: string, settings: Map<string, string | undefined>) {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    const separator = trimmed.indexOf('=')
    if (separator < 1 || /^[;#]/.test(trimmed)) continue
    const key = settingKey(trimmed.slice(0, separator).trim())
    if (!key) continue
    const raw = trimmed.slice(separator + 1).trim()
    const value = /^(?:".*"|'.*')$/.test(raw) ? raw.slice(1, -1) : raw.split(/\s[;#]/, 1)[0].trim()
    // An unresolved higher-priority secret masks lower-priority credentials.
    // Invalid registry expansion fails URL validation instead of routing elsewhere.
    settings.set(key, expand(value) ?? (key.endsWith('registry') ? value : undefined))
  }
}

/** Load optional files without copying paths, contents or IO details into errors. */
async function readNpmrc(file: string, settings: Map<string, string | undefined>) {
  try {
    readSettings(await readFile(file, 'utf8'), settings)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not read npm registry settings')
  }
}

/** Normalize endpoints and reject credentials, queries and non-HTTP protocols. */
function registryBase(value: string): string {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid registry URL')
    return url.href.endsWith('/') ? url.href : `${url.href}/`
  }
  catch { throw new Error('Invalid registry URL') }
}

/** Resolve env over project over workspace over user npmrc; never read global npmrc. */
export async function resolveNpmConfig(root: string, registryUrl?: string): Promise<NpmRegistryConfig> {
  root = path.resolve(root)
  const settings = new Map<string, string | undefined>()
  // Lowercase npm_config_* names override uppercase aliases, matching npm.
  const env = Object.entries(process.env).filter(([key, value]) => /^npm_config_/i.test(key) && value).sort(([a], [b]) => Number(a.startsWith('npm_config_')) - Number(b.startsWith('npm_config_')))
  const userconfig = env.filter(([key]) => key.toLowerCase() === 'npm_config_userconfig').at(-1)?.[1]
  const userFile = userconfig ? expand(userconfig) : path.join(process.env.HOME || homedir(), '.npmrc')
  if (userFile) await readNpmrc(path.resolve(root, userFile), settings)
  const workspace = await findWorkspaceRoot(root)
  if (workspace !== root) await readNpmrc(path.join(workspace, '.npmrc'), settings)
  await readNpmrc(path.join(root, '.npmrc'), settings)
  for (const [name, value] of env) {
    const key = settingKey(name.slice('npm_config_'.length))
    if (key) settings.set(key, expand(value!) ?? (key.endsWith('registry') ? value : undefined))
  }
  const registries = new Map<string, string>()
  const credentials = new Map<string, Credential>()
  for (const [key, value] of settings) {
    if (key.endsWith('registry')) {
      if (value && !registryUrl) registries.set(key, registryBase(value))
      continue
    }
    const separator = key.lastIndexOf(':')
    let prefix: string
    try {
      prefix = registryBase(`https:${key.slice(0, separator)}`).slice('https:'.length)
    }
    catch { continue }
    const credential = credentials.get(prefix) ?? { prefix }
    const property = { _authtoken: 'token', _auth: 'auth', username: 'username', _password: 'password' }[key.slice(separator + 1)]
    if (property) credential[property] = value
    credentials.set(prefix, credential)
  }
  const fallback = registryBase(registryUrl ?? registries.get('registry') ?? 'https://registry.npmjs.org/')
  const ordered = [...credentials.values()].sort((a, b) => b.prefix.length - a.prefix.length)
  return {
    /** Use fixture override for every route, including scoped package requests. */
    registryFor: (id = '') => registryUrl ? fallback : registries.get(`${id.split('/')[0]}:registry`) ?? fallback,
    /** Never attach credentials to another host, port or sibling path. */
    authorizationFor: (value) => {
      const url = new URL(value)
      if (!['https:', 'http:'].includes(url.protocol)) return undefined
      const target = `//${url.host}${url.pathname}`
      for (const credential of ordered) {
        if (!target.startsWith(credential.prefix)) continue
        let authorization: string | undefined
        if (credential.token) authorization = `Bearer ${credential.token}`
        else if (credential.auth) authorization = `Basic ${credential.auth}`
        else if (credential.username && credential.password) authorization = `Basic ${Buffer.from(`${credential.username}:${Buffer.from(credential.password, 'base64').toString('utf8')}`).toString('base64')}`
        // Fetch can quote invalid header values in thrown errors. Reject them
        // before constructing headers so malformed credentials never escape.
        if (authorization && !/[^\x20-\x7E]/.test(authorization)) return authorization
      }
    },
  }
}

/** Canonical credential-free packument URL shared by fetches and read-only planners. */
export function registryPackumentUrl(config: NpmRegistryConfig, id: string): string {
  packageName.parse(id)
  return new URL(encodeURIComponent(id), config.registryFor(id)).href
}

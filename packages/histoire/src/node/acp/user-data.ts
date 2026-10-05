import type { AcpSettingsOverrides, AcpUserData } from './types.js'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { stripVTControlCharacters } from 'node:util'
import path from 'pathe'
import { validateAgentEnvironment, validateAgentOverrides, validateAgentSettings } from './validation.js'

/** Platform-appropriate private Histoire user settings file. */
export function agentUserDataFile(): string {
  const directory = process.platform === 'win32'
    ? process.env.LOCALAPPDATA ?? process.env.APPDATA ?? homedir()
    : process.platform === 'darwin' ? path.join(homedir(), 'Library/Application Support') : process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
  return path.join(directory, 'histoire', 'agents.json')
}

/** Reads user-level secrets without ever returning them to a browser. */
export async function readAgentUserData(file: string): Promise<AcpUserData> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (![1, 2].includes(parsed.version) || !parsed.projects || !parsed.env || Array.isArray(parsed.projects) || Array.isArray(parsed.env) || typeof parsed.projects !== 'object' || typeof parsed.env !== 'object') throw new Error('Invalid agent user settings; repair agents.json')
    // Disk contents cross the same boundary as browser updates: malformed env
    // values must never reach process.env or the public redactor.
    for (const [root, settings] of Object.entries(parsed.projects)) parsed.projects[root] = parsed.version === 1 ? validateAgentSettings(settings) : validateAgentOverrides(settings)
    for (const [agentId, env] of Object.entries(parsed.env)) parsed.env[agentId] = validateAgentEnvironment({ agentId, env }).env
    // Legacy snapshots contain no intent metadata: preserve commands/policies
    // conservatively as explicit overrides until a verified save/reset retires them.
    parsed.version = 2
    return parsed
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read agent user settings; repair agents.json')
    return { version: 2, projects: {}, env: {} }
  }
}

/** Serializes private user-data updates without erasing other projects' settings. */
const userWrites = new Map<string, Promise<unknown>>()

/** Updates one user-level preference/credential record atomically with private modes. */
export async function updateAgentUserData(file: string, root: string, settings?: AcpSettingsOverrides, environment?: { id: string, value: Record<string, string> }): Promise<AcpUserData> {
  const previous = userWrites.get(file) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const data = await readAgentUserData(file)
    if (settings) data.projects[root] = validateAgentOverrides(settings)
    if (environment) data.env[environment.id] = validateAgentEnvironment({ agentId: environment.id, env: { ...data.env[environment.id], ...environment.value } }).env
    const directory = path.dirname(file)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = path.join(directory, `.agents-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      await rename(temporary, file)
      await chmod(file, 0o600)
      return data
    }
    finally {
      await rm(temporary, { force: true })
    }
  })
  userWrites.set(file, next)
  try {
    return await next
  }
  finally { if (userWrites.get(file) === next) userWrites.delete(file) }
}

/** Redacts all explicit environment values plus inherited credentials before public output. */
function agentSecrets(environment: Record<string, string> | readonly Record<string, string>[]): string[] {
  const environments: readonly Record<string, string>[] = Array.isArray(environment)
    ? environment
    : [environment]
  const secrets = new Set<string>(
    environments.flatMap((item): string[] => Object.values(item)).filter(Boolean),
  )
  for (const [key, value] of Object.entries(process.env)) {
    if (value && /token|secret|password|credential|api_?key|private_?key/i.test(key)) secrets.add(value)
  }
  return [...secrets].sort((first, second) => second.length - first.length)
}

/** Redacts exact known secrets before any public projection. */
export function createAgentRedactor(
  environment: Record<string, string> | readonly Record<string, string>[],
  maximum = 16_000,
): (value: string) => string {
  const secrets = agentSecrets(environment)
  return (value) => {
    for (const secret of secrets) value = value.split(secret).join('[redacted]')
    return stripVTControlCharacters(value).slice(-maximum)
  }
}

/** Buffers enough raw tail to redact credentials spanning consecutive ACP chunks. */
export function createAgentOutputFilter(environment: Record<string, string>) {
  const secrets = agentSecrets(environment)
  const redact = createAgentRedactor(environment, 1024 * 1024)
  const reserve = Math.max(0, ...secrets.map(secret => secret.length - 1))
  let buffer = ''
  /** Emits only a prefix which cannot begin a still-incomplete secret. */
  function push(text: string, final = false): string {
    buffer += text
    let cut = final ? buffer.length : Math.max(0, buffer.length - reserve)
    if (!final) {
      for (const secret of secrets) {
        let start = buffer.indexOf(secret)
        while (start !== -1 && start < cut) {
          if (start + secret.length > cut) {
            cut = start
            break
          }
          start = buffer.indexOf(secret, start + secret.length)
        }
      }
    }
    const output = redact(buffer.slice(0, cut))
    buffer = buffer.slice(cut)
    return output
  }
  return { push, finish: () => push('', true) }
}

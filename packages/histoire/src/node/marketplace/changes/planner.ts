import type { ChangePlan, ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { guardConfigFile, guardProjectPath } from '../../config/codemod/security.js'
import { hashConfigCode } from '../../config/codemod/write.js'
import { compareVersions } from '../catalog/version.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { editPluginConfig } from './config-edit.js'
import { hasManagedConfigInput } from './config-inputs.js'
import { fileDiff } from './diff.js'
import { manualPlan } from './manual.js'
import { optionEdits } from './options.js'
import { editPackageJson } from './package-edit.js'
import { detectPackageManager, findWorkspaceRoot, lockfiles, packageCommand } from './package-manager.js'
import { changeRequestSchema, exactVersion } from './validation.js'

/** Declarative target metadata, resolved without executing package code. */
export interface PlanningPlugin {
  /** Target-version manifest. */ manifest: MarketplaceManifest
  /** Concrete target version. */ version: string
}
/** Read-only project dependencies for one generation's planner. */
export interface PlannerOptions {
  /** Project directory. */ root: string
  /** Existing standalone Histoire config, if available. */ configFile?: string
  /** Static contexts cannot automate project changes. */ static?: boolean
  /** Loader-reported Histoire and Vite inputs, read afresh at review and admission. */ configDependencies?: () => Iterable<string>
  /** Target metadata resolver; registry access belongs to the catalog service. */ resolvePlugin: (request: ChangeRequest) => Promise<PlanningPlugin>
  /** Clock for bounded retention, injectable without replacing global time. */ now?: () => number
}
/** Private execution material never exposed over the UI channel. */
export interface PlannedChange {
  /** Review DTO. */ plan: ChangePlan
  /** Validated intent with concrete version. */ request: ChangeRequest
  /** Original config revision required by writeConfig. */ configHash?: string
  /** Exact proposed config source. */ configCode?: string
  /** Exact proposed project manifest source. */ packageCode: string
  /** Original project manifest revision. */ packageHash: string
  /** Declarative manifest used by the editor. */ manifest: MarketplaceManifest
}
/** Controlled planner error consumable by channel and job admission. */
export class PlanningError extends Error {
  /** Public failure code. */
  code: 'invalid' | 'stale' | 'unavailable' | 'failed'

  /** Attaches a transport-safe code to a readable failure. */
  constructor(code: PlanningError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/** Reads existing project bytes; absence alone is not an IO failure. */
async function optionalRead(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Computes fresh argv, exact source edits and a review hash without writes. */
export async function computePlan(options: PlannerOptions, input: ChangeRequest): Promise<PlannedChange> {
  const parsed = changeRequestSchema.safeParse(input)
  if (!parsed.success) throw new PlanningError('invalid', 'Invalid plugin change')
  const plugin = await options.resolvePlugin(parsed.data)
  const request: ChangeRequest = { ...parsed.data, version: parsed.data.version ?? plugin.version }
  exactVersion.parse(request.version)
  optionEdits(plugin.manifest.config.options ?? [], request.options)
  const manager = options.static ? undefined : await detectPackageManager(options.root, request.prefs.packageManager)
  const packageFile = await guardProjectPath(path.join(options.root, 'package.json'), options.root)
  const packageBefore = await optionalRead(packageFile) ?? '{}\n'
  const configFile = options.configFile && await guardConfigFile(options.configFile, { root: options.root })
  const configBefore = configFile ? await optionalRead(configFile) : undefined
  const plan: ChangePlan = {
    planId: '',
    hash: '',
    packageManager: manager ? { name: manager.name, source: manager.source } : { name: request.prefs.packageManager === 'auto' ? 'npm' : request.prefs.packageManager, source: 'override' },
    files: [],
    warnings: [],
  }
  const result: PlannedChange = {
    plan,
    request,
    configHash: configBefore === undefined ? undefined : hashConfigCode(configBefore),
    packageCode: packageBefore,
    packageHash: hashConfigCode(packageBefore),
    manifest: plugin.manifest,
  }
  const installed = request.kind === 'pin' ? await readInstalledPackage(options.root, request.id) : undefined
  if (typeof installed?.version === 'string' && compareVersions(request.version!, installed.version) < 0) {
    plan.warnings.push(`Pinning ${request.id} downgrades from ${installed.version} to ${request.version}. Config migrations are not applied.`)
  }
  let reason: NonNullable<ChangePlan['manual']>['reason'] | undefined
  if (options.static) reason = 'static'
  else if (configBefore === undefined) reason = 'config-not-literal'
  else if (await hasManagedConfigInput(configFile, options.configDependencies?.())) reason = 'config-not-literal'
  else if (!manager) reason = 'no-package-manager'
  else if (request.migrate) reason = 'migration-manual'
  const packageData = JSON.parse(packageBefore)
  const ranges = ['dependencies', 'devDependencies', 'optionalDependencies'].map(key => packageData[key]?.[request.id])
  if (!reason && ranges.some(value => typeof value === 'string' && /^(?:workspace:|file:|link:|portal:)/.test(value))) reason = 'workspace-unsupported'
  if (!reason) {
    try {
      result.configCode = editPluginConfig(configBefore, request, plugin.manifest)
    }
    catch { reason = 'config-not-literal' }
  }
  if (reason) {
    plan.manual = manualPlan(reason, request, plugin.manifest)
  }
  else {
    plan.command = packageCommand(manager, request)
    result.packageCode = editPackageJson(packageBefore, request)
    if (result.configCode !== configBefore) plan.files.push(fileDiff(path.relative(options.root, configFile), configBefore, result.configCode))
    if (result.packageCode !== packageBefore) plan.files.push(fileDiff('package.json', packageBefore, result.packageCode))
    if (plan.command) plan.warnings.push('Package manager may also change the lockfile and node_modules')
  }
  const boundary = await findWorkspaceRoot(options.root)
  const lockPaths: string[] = []
  for (let directory = path.resolve(options.root); ; directory = path.dirname(directory)) {
    for (const name of [...lockfiles, 'pnpm-workspace.yaml']) lockPaths.push(path.join(directory, name))
    if (directory === boundary) break
  }
  const locks = await Promise.all(lockPaths.map(async file => [file, await optionalRead(await guardProjectPath(file, boundary))]))
  // Bind the review to exact source bytes as well as displayed hunks. This also
  // catches changes outside diff context, formatting, lockfiles and EOF newlines.
  plan.hash = createHash('sha256').update(JSON.stringify({ argv: plan.command?.argv, files: plan.files, warnings: plan.warnings, installedVersion: installed?.version, configHash: result.configHash, configCode: result.configCode, packageHash: result.packageHash, packageCode: result.packageCode, locks, manifest: plugin.manifest, manual: plan.manual })).digest('hex')
  return result
}

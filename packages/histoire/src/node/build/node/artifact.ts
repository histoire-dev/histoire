import type { ArtifactManifest } from '../../deploy/artifact-schema.js'
import type { NodeBuildLayout } from './layout.js'
import type { NodeBuildSnapshot } from './snapshot.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readHistoireVersion } from '../../mcp/package-version.js'
import { bundleNodeRuntime } from './bundle.js'
import { inventoryPublicAssets, writeNodeContent } from './content.js'
import { createArtifactManifest } from './manifest.js'
import { createNodePackage } from './package.js'
import { validateNodeBundleImport } from './validate-bundle.js'

/** Full artifact packaging inputs; production entry is supplied only by deploy slice. */
export interface WriteNodeArtifactOptions {
  /** Owned staging containing already completed public browser build. */
  layout: NodeBuildLayout
  /** Completed immutable source/docs/settings projection. */
  snapshot: NodeBuildSnapshot
  /** Real production boot module; fixture entries are allowed only in focused tests. */
  entryFile: string
  /** Actual preview test runtime was emitted by browser build. */
  testRuntimeIncluded: boolean
  /** Optional supported browser version, resolved at build time. */
  playwrightVersion?: string
  /** Installed package metadata version, injectable for focused writer tests. */
  histoireVersion?: string
}

/** Packages and validates a complete portable artifact without publishing any partial output. */
export async function writeNodeArtifact(options: WriteNodeArtifactOptions): Promise<ArtifactManifest> {
  const version = options.histoireVersion ?? readHistoireVersion()
  const manifest = createArtifactManifest(options.snapshot, await inventoryPublicAssets(options.layout.publicDir), options.testRuntimeIncluded, version)
  await writeNodeContent(options.layout.privateDir, options.snapshot.blobs)
  await writeFile(join(options.layout.privateDir, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  await writeFile(join(options.layout.stagingDir, 'package.json'), `${JSON.stringify(createNodePackage(version, options.playwrightVersion), null, 2)}\n`, 'utf8')
  const bundlePath = join(options.layout.stagingDir, 'server.mjs')
  await bundleNodeRuntime(options.entryFile, bundlePath)
  await validateNodeBundleImport(bundlePath)
  return manifest
}

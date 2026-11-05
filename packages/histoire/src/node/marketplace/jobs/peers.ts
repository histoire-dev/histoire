import { satisfiesVersion } from '../catalog/version.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'

/** Installed peer that the plugin's declared range rejects. */
interface UnmetPeer {
  /** Peer package name. */ peer: string
  /** Range declared by the installed plugin. */ range: string
  /** Version actually installed in the project. */ found: string
}

/** Package step finished but left the project with an incompatible peer. */
export class PeerConflictError extends Error {
  /**
   * @param unmet First rejected peer, used for failure advice.
   */
  constructor(readonly unmet: UnmetPeer) {
    super(`unmet peer ${unmet.peer}@${unmet.range}: found ${unmet.found}`)
  }
}

/**
 * Checks installed peers against the installed plugin's own declaration.
 * Some managers (pnpm `add`) only warn on peer conflicts and exit zero, so the job
 * can't rely on the exit code. Missing or optional peers are left to the manager.
 * @param root Project root.
 * @param id Installed plugin package name.
 * @returns The first incompatible peer, if any.
 */
export async function findUnmetPeer(root: string, id: string): Promise<UnmetPeer | undefined> {
  const plugin = await readInstalledPackage(root, id)
  const peers: Record<string, unknown> = plugin.peerDependencies ?? {}
  for (const [peer, range] of Object.entries(peers)) {
    if (typeof range !== 'string' || plugin.peerDependenciesMeta?.[peer]?.optional) continue
    const { version } = await readInstalledPackage(root, peer)
    if (typeof version === 'string' && !satisfiesVersion(version, range)) return { peer, range, found: version }
  }
}

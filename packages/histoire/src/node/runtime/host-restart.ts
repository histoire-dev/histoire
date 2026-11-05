/** Why the runtime asks its host for a replacement process. */
export interface HostRestartRequest {
  /** Short label shown in the host's restart notice. */ source: string
  /** Successor skips cached catalog restoration and forces dependency optimization. */ fresh?: boolean
}

/** Delivers a request to the owning host; returns whether it was handed over. */
export type HostRestart = (request: HostRestartRequest) => boolean

let handler: HostRestart | undefined

/**
 * Registers the process host able to replace this runtime with a new process (the dev proxy
 * parent of a CLI child). In-process SDK runtimes register nothing: they can't drop loaded modules.
 * @param value Delivery function, or `undefined` to unregister.
 */
export function setHostRestart(value: HostRestart | undefined): void {
  handler = value
}

/**
 * Current host restart delivery, when this process has one.
 * @returns The registered function, or `undefined` without a host.
 */
export function getHostRestart(): HostRestart | undefined {
  return handler
}

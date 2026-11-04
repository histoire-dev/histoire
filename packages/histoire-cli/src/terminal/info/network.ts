import type { NetworkInterfaceInfo } from 'node:os'

/** Interface table shape of `os.networkInterfaces()`. */
export type InterfaceTable = Record<string, readonly NetworkInterfaceInfo[] | undefined>

/** Whether a configured binding only accepts connections from this machine. */
function isLoopbackHost(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return name === 'localhost' || name.endsWith('.localhost') || name === '::1' || name === '0:0:0:0:0:0:0:1' || /^127\./.test(name)
}

/** Whether a configured binding listens on every interface. */
function isWildcardHost(host: string): boolean {
  const name = host.trim().replace(/^\[|\]$/g, '')
  return name === '0.0.0.0' || name === '::' || name === '0:0:0:0:0:0:0:0'
}

/**
 * Derives the addresses other machines can use from the configured binding, never from
 * a loopback-only listener, and never inventing one when no interface is reachable.
 * @param options Binding and environment.
 * @param options.host The `--host` value: undefined/false keep the default loopback binding, `true` listens everywhere, a string binds that address.
 * @param options.publicUrl Bound public URL; supplies port and protocol (its hostname is ignored).
 * @param options.interfaces Network interfaces (`os.networkInterfaces()`).
 * @returns Absolute base URLs, one per reachable address.
 */
export function deriveNetworkUrls(options: { host: string | boolean | undefined, publicUrl: string | undefined, interfaces: InterfaceTable }): string[] {
  const { host, publicUrl } = options
  if (!publicUrl || host === undefined || host === false) return []
  let base: URL
  try {
    base = new URL(publicUrl)
  }
  catch {
    return []
  }
  let addresses: string[]
  if (host === true || isWildcardHost(host)) {
    // Wildcard: every external IPv4 address (IPv6 link-local ones are not shareable). `::` also accepts IPv4 on dual-stack systems.
    addresses = Object.values(options.interfaces).flatMap(list => list ?? []).filter(entry => !entry.internal && entry.family === 'IPv4').map(entry => entry.address)
  }
  else if (isLoopbackHost(host)) {
    return []
  }
  else {
    addresses = [host.replace(/^\[|\]$/g, '')]
  }
  return [...new Set(addresses)].map((address) => {
    const url = new URL(base.href)
    // Bare IPv6 literals need brackets, otherwise the hostname setter ignores them.
    url.hostname = address.includes(':') ? `[${address}]` : address
    return url.href
  })
}

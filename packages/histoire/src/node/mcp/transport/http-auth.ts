import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'

/** Captures private listener credentials before project config or workers can read env. */
export function captureMcpToken(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = environment.HISTOIRE_MCP_TOKEN
  delete environment.HISTOIRE_MCP_TOKEN
  return token
}

/** Accepts canonical hexadecimal/base64url tokens containing at least 32 decoded bytes. */
export function validateMcpToken(token: string | undefined, required = false): void {
  if (token === undefined) {
    if (required) throw new Error('HISTOIRE_MCP_TOKEN is required when deployed MCP is enabled')
    return
  }
  let decoded: Buffer | undefined
  if (/^(?:[\da-f]{2})+$/i.test(token)) {
    decoded = Buffer.from(token, 'hex')
  }
  else if (/^[\w-]+$/.test(token)) {
    const bytes = Buffer.from(token, 'base64url')
    if (bytes.toString('base64url') === token) decoded = bytes
  }
  if (!decoded || decoded.length < 32 || token.length > 4096) throw new Error('HISTOIRE_MCP_TOKEN must contain at least 32 bytes in hexadecimal or base64url form')
}

/** Creates one fixed-size comparison digest, never logging or returning credentials. */
export function createMcpTokenVerifier(token: string | undefined) {
  const expected = token === undefined ? undefined : createHash('sha256').update(token).digest()
  return (authorization: string | string[] | undefined): boolean => {
    if (!expected) return true
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
    const received = createHash('sha256').update(authorization.slice(7)).digest()
    return timingSafeEqual(expected, received)
  }
}

/** Stable identity for one configured machine credential, without exposing that credential. */
export function createMcpBearerPrincipal(token: string): string {
  return `bearer:${createHash('sha256').update(token).digest('hex')}`
}

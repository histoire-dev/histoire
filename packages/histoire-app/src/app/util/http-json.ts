/**
 * Same-origin URL of a dev-server UI route beneath `__histoire/`, honoring the configured base.
 * @param path Route path after `__histoire/`, without leading slash.
 */
export function uiHttpUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/__histoire/${path}`
}

/**
 * Same-origin request returning JSON; non-2xx responses throw their controlled `error` text.
 * @param url Request URL.
 * @param init Fetch options; credentials are always same-origin.
 * @param fallback Error message when the server gives none.
 */
export async function requestJson<T>(url: string, init: RequestInit = {}, fallback = 'Request failed'): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  if (!response.ok) {
    const value = await response.json().catch(() => undefined)
    throw new Error(typeof value?.error === 'string' ? value.error.slice(0, 2000) : fallback)
  }
  return response.json()
}

/**
 * JSON POST body options for {@link requestJson}.
 * @param body Serializable payload.
 */
export function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

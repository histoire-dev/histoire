/** Portable PNG metadata; adapters add their own artifact URI or delivery shape. */
export interface ScreenshotResult {
  /** Exact selected story. */
  storyId: string
  /** Exact scoped selected variant. */
  variantId: string
  /** Decoded PNG device pixel width. */
  width: number
  /** Decoded PNG device pixel height. */
  height: number
  /** Fixed capture encoding. */
  mimeType: 'image/png'
  /** Full PNG byte count. */
  bytes: number
  /** Full PNG digest. */
  sha256: string
}

/** Lane-owned detached result; no browser or DOM objects escape capture. */
export interface ScreenshotOutput {
  /** Independently retained PNG bytes. */
  artifact: Uint8Array
  /** Validated device pixel dimensions and identity. */
  result: ScreenshotResult
}

/** Optional UI file encoding preserves MCP's default PNG contract. */
export interface ScreenshotFileOutput {
  /** Encoded image bytes with no browser objects. */
  artifact: Uint8Array
  /** Captured PNG dimensions remain authoritative before optional WebP encoding. */
  result: Omit<ScreenshotResult, 'mimeType'> & { mimeType: 'image/png' | 'image/webp' }
}

/** Saved screenshot name projection; exact path remains clipboard/thumbnail identity. */
interface ScreenshotFileDetails {
  /** Complete stored basename for metadata. */
  name: string
  /** Distinguishing UUID suffix and format for compact rows. */
  shortName: string
  /** ISO capture time only when generated filename provides a valid timestamp. */
  capturedAt?: string
}

/** Keeps distinguishing suffix visible when story/variant prefixes repeat. */
export function screenshotFileDetails(path: string): ScreenshotFileDetails {
  const name = path.split('/').pop() || path
  const capture = name.match(/--(\d+)-([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\.(png|webp)$/i)
  const timestamp = capture ? Number(capture[1]) : Number.NaN
  const date = new Date(timestamp)
  return {
    name,
    shortName: capture ? `…${capture[2].slice(-12)}.${capture[3]}` : name.length > 28 ? `${name.slice(0, 10)}…${name.slice(-17)}` : name,
    capturedAt: Number.isSafeInteger(timestamp) && Number.isFinite(date.getTime()) ? date.toISOString() : undefined,
  }
}

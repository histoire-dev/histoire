/** Forces light modules on a dark ground so the code scans on both light and dark terminal themes. */
const LIGHT_ON_DARK = '\u001B[97;40m'
/** Restores default foreground and background. */
const DEFAULT_COLORS = '\u001B[39;49m'

/**
 * Renders a URL as a QR code with two modules per terminal row (half blocks).
 * Loads `uqr` on first use so the parent's startup graph stays light.
 * @param url Address to encode.
 * @returns One string per terminal row, each colored independently of the terminal theme.
 */
export async function renderQrRows(url: string): Promise<string[]> {
  const { renderUnicodeCompact } = await import('uqr')
  return renderUnicodeCompact(url, { border: 2 }).split('\n').map(row => `${LIGHT_ON_DARK}${row}${DEFAULT_COLORS}`)
}

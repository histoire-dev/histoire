/**
 * Page background of the startup document, mirroring the workbench home tokens.
 * Runtime documents loaded after it (the workbench app shell) paint the same
 * color before their styles exist, so the handoff never flashes.
 */
export const startupBackground = {
  /** Light scheme background. */
  light: 'rgb(247 247 248)',
  /** Dark scheme background. */
  dark: 'rgb(13 14 17)',
} as const

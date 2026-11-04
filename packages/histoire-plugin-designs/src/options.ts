/** Configuration of HstDesigns. */
export interface DesignsOptions {
  /** Enable the plugin; defaults to true. */
  enabled?: boolean
  /** Exclude the plugin from static books; defaults to false. */
  devOnly?: boolean
  /** Site name sent to Figma as `embed-host`; defaults to `histoire`. */
  embedHost?: string
  /** Add the Design canvas arrangement showing the variant next to its design; defaults to true. */
  canvasView?: boolean
}

/** Serializable settings shared with the workbench module. */
export interface BrowserOptions {
  /** Figma `embed-host` value. */
  embedHost: string
  /** Register the Design canvas arrangement. */
  canvasView: boolean
}

/**
 * Applies defaults and validates user options.
 * @param options User options.
 */
export function normalizeOptions(options: DesignsOptions): BrowserOptions {
  const embedHost = options.embedHost ?? 'histoire'
  if (typeof embedHost !== 'string' || !embedHost.trim()) throw new TypeError('[@histoire/plugin-designs] embedHost must be a non-empty string')
  return { embedHost: embedHost.trim(), canvasView: options.canvasView ?? true }
}

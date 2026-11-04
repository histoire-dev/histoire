/** Design types shown in an iframe. */
export type EmbedDesignType = 'figma' | 'penpot' | 'sketch' | 'iframe'

/** Fields shared by every design entry. */
interface DesignBase {
  /** Link to the design; `http(s)`, or a path relative to the book base for images. */
  url: string
  /** Label in the design switcher; defaults to the design tool or host name. */
  name?: string
}

/** Design shown in an iframe: Figma, Penpot or Sketch link, or any embeddable page. */
export interface EmbedDesignInput extends DesignBase {
  /** Embed type. */
  type: EmbedDesignType
  /** Let the embedded page go fullscreen. */
  allowFullscreen?: boolean
}

/** Static image with zoom and pan. */
export interface ImageDesignInput extends DesignBase {
  /** Image design. */
  type: 'image'
  /** Initial zoom factor, greater than 0; defaults to fitting the image. */
  scale?: number
  /** Initial offset in pixels; positive `x` moves right, positive `y` moves down. */
  offset?: [number, number]
  /** Alternative text. */
  alt?: string
}

/** Design that only opens in a new browser tab. */
export interface LinkDesignInput extends DesignBase {
  /** Link design. */
  type: 'link'
  /** Link text; defaults to `name` or the host name. */
  label?: string
}

/** One design entry of `meta.design`. */
export type DesignInput = EmbedDesignInput | ImageDesignInput | LinkDesignInput

/** Fields shared by every validated design. */
interface ResolvedBase {
  /** Position in the entry list, stable while metadata is unchanged. */
  index: number
  /** Switcher label. */
  name: string
  /** Link opened in a new tab. */
  externalUrl: string
}

/** Validated iframe design. */
export interface ResolvedEmbedDesign extends ResolvedBase {
  /** Embed type. */
  type: EmbedDesignType
  /** Iframe URL. */
  src: string
  /** Fullscreen permission. */
  allowFullscreen: boolean
}

/** Validated image design. */
export interface ResolvedImageDesign extends ResolvedBase {
  /** Image design. */
  type: 'image'
  /** Absolute image URL. */
  src: string
  /** Initial zoom; fit when absent. */
  scale?: number
  /** Initial offset in pixels. */
  offset?: [number, number]
  /** Alternative text. */
  alt: string
}

/** Validated link design. */
export interface ResolvedLinkDesign extends ResolvedBase {
  /** Link design. */
  type: 'link'
  /** Link text. */
  label: string
}

/** Validated design ready to render. */
export type ResolvedDesign = ResolvedEmbedDesign | ResolvedImageDesign | ResolvedLinkDesign

/** Entry of `meta.design` that cannot be shown. */
export interface DesignIssue {
  /** Position in the entry list. */
  index: number
  /** User-facing reason. */
  message: string
}

declare module '@histoire/shared' {
  interface CommonMeta {
    /** Designs shown by `@histoire/plugin-designs`; a variant's list replaces its story's. */
    design?: DesignInput | DesignInput[]
  }
}

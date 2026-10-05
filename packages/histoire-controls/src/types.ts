/** Shared label placement for wrapped and inline controls. */
export type HstControlLayout = 'stacked' | 'horizontal' | 'inline'

/** One visible option, retaining its original runtime value. */
export interface HstControlOption {
  /** Text displayed to users and assistive technology. */
  label: string
  /** Original value; object identity is retained locally. */
  value: any
  /** Unavailable options remain visible but cannot be selected. */
  disabled?: boolean
}

/** Public imperative field handle used by focus-owning consumers. */
export interface HstControlHandle {
  /** Focus owning interactive element. */
  focus: () => void
  /** Select editable text where supported. */
  select?: () => void
}

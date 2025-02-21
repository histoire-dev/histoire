import type { HstControlOption } from '@histoire/controls'
import type { Story, StoryProps, Variant, VariantProps } from '@histoire/shared'
import type { SvelteComponent } from 'svelte'

export interface SvelteStorySetupApi {
  app: any
  story?: Story
  variant?: Variant
}

export type SvelteStorySetupHandler = (api: SvelteStorySetupApi) => Promise<void> | void

export function defineSetupSvelte(handler: SvelteStorySetupHandler): SvelteStorySetupHandler {
  return handler
}

export interface Hst {
  // Main built-ins
  Story: typeof SvelteComponent<StoryProps>
  Variant: typeof SvelteComponent<VariantProps>
  // Controls
  Button: typeof SvelteComponent
  ButtonGroup: typeof SvelteComponent<{
    value?: string
    options: (string | HstControlOption)[]
    title?: string
  }>
  Checkbox: typeof SvelteComponent<{
    value?: boolean
    title: string
  }>
  CheckboxList: typeof SvelteComponent<{
    value: string[]
    options: (string | HstControlOption)[]
    title?: string
  }>
  Text: typeof SvelteComponent<{
    value?: string
    title: string
  }>
  Number: typeof SvelteComponent<{
    value?: number
    title: string
    step?: number
  }>
  Slider: typeof SvelteComponent<{
    value?: number
    title: string
    min: number
    max: number
    step?: number
  }>
  Textarea: typeof SvelteComponent<{
    value?: string
    title: string
  }>
  Select: typeof SvelteComponent<{
    value?: string
    title: string
    options: Record<string, any> | string[] | HstControlOption[]
  }>
  Radio: typeof SvelteComponent<{
    value?: string
    options: HstControlOption[]
    title?: string
  }>
  Json: typeof SvelteComponent<{
    value: unknown
    title: string
  }>
  Shades: typeof SvelteComponent<{
    shades: Record<string, any>
    getName?: (key: string, color: string) => string
    search?: string
  }>
  TokenList: typeof SvelteComponent<{
    tokens: Record<string, string | number | any[] | Record<string, any>>
    getName?: (key: string, value: string | number | any[] | Record<string, any>) => string
  }>
  TokenGrid: typeof SvelteComponent<{
    tokens: Record<string, string | number | any[] | Record<string, any>>
    getName?: (key: string, value: string | number | any[] | Record<string, any>) => string
    colSize?: number
  }>
  CopyIcon: typeof SvelteComponent<{
    content: string
  }>
  ColorSelect: typeof SvelteComponent<{
    value?: string
    title: string
  }>
}

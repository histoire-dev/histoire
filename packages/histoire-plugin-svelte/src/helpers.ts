import type { HstControlOption } from '@histoire/controls'
import type { Story, StoryProps, Variant, VariantProps } from '@histoire/shared'
import type { SvelteComponentTyped } from 'svelte'

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
  Story: typeof SvelteComponentTyped<StoryProps>
  Variant: typeof SvelteComponentTyped<VariantProps>
  // Controls
  Button: typeof SvelteComponentTyped
  ButtonGroup: typeof SvelteComponentTyped<{
    value?: string
    options: (string | HstControlOption)[]
    title?: string
  }>
  Checkbox: typeof SvelteComponentTyped<{
    value?: boolean
    title: string
  }>
  CheckboxList: typeof SvelteComponentTyped<{
    value: string[]
    options: (string | HstControlOption)[]
    title?: string
  }>
  Text: typeof SvelteComponentTyped<{
    value?: string
    title: string
  }>
  Number: typeof SvelteComponentTyped<{
    value?: number
    title: string
    step?: number
  }>
  Slider: typeof SvelteComponentTyped<{
    value?: number
    title: string
    min: number
    max: number
    step?: number
  }>
  Textarea: typeof SvelteComponentTyped<{
    value?: string
    title: string
  }>
  Select: typeof SvelteComponentTyped<{
    value?: string
    title: string
    options: Record<string, any> | string[] | HstControlOption[]
  }>
  Radio: typeof SvelteComponentTyped<{
    value?: string
    options: HstControlOption[]
    title?: string
  }>
  Json: typeof SvelteComponentTyped<{
    value: unknown
    title: string
  }>
  Shades: typeof SvelteComponentTyped<{
    shades: Record<string, any>
    getName?: (key: string, color: string) => string
    search?: string
  }>
  TokenList: typeof SvelteComponentTyped<{
    tokens: Record<string, string | number | any[] | Record<string, any>>
    getName?: (key: string, value: string | number | any[] | Record<string, any>) => string
  }>
  TokenGrid: typeof SvelteComponentTyped<{
    tokens: Record<string, string | number | any[] | Record<string, any>>
    getName?: (key: string, value: string | number | any[] | Record<string, any>) => string
    colSize?: number
  }>
  CopyIcon: typeof SvelteComponentTyped<{
    content: string
  }>
  ColorSelect: typeof SvelteComponentTyped<{
    value?: string
    title: string
  }>
}

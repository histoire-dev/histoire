/* eslint-disable @typescript-eslint/ban-types */

import type {
  StoryLayout,
  Story,
  Variant,
} from '@histoire/shared'
import type {
  HstButton,
  HstButtonGroup,
  HstCheckbox,
  HstCheckboxList,
  HstText,
  HstNumber,
  HstSlider,
  HstTextarea,
  HstSelect,
  HstRadio,
  HstJson,
  HstColorShades,
  HstTokenList,
  HstTokenGrid,
  HstCopyIcon,
} from '@histoire/controls'

// Utils

declare type NonUndefinedable<T> = T extends undefined ? never : T
declare type TypePropsToRuntimeProps<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? {
    type: import('vue').PropType<NonUndefinedable<T[K]>>
  } : {
    type: import('vue').PropType<T[K]>
    required: true
  }
}

// <Story>

interface VueStoryProps {
  /**
   * Title of the story.
   */
  title?: string
  /**
   * Id of the story used in the URL. By default, the id is automatically generated from the file path. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.
   */
  id?: string
  /**
   * Layout of the story.
   */
  layout?: StoryLayout
  /**
   * Function that returns the intial state. Will be used as default value for variants.
   */
  initState?: () => Record<string, any>
  /**
   * A function to configure the Vue application. This will be the default for the variants in the story.
   */
  setupApp?: (payload: { app: import('vue').App, story: Story, variant: Variant }) => void | Promise<void>
  /**
   * The id of a group to include the story in.
   */
  group?: string
  /**
   * An Iconify id to customize the story icon in the tree.
   * https://icones.js.org/
   */
  icon?: string
  /**
   * The icon color.
   * Example: `#8B5CF6`
   */
  iconColor?: string
  /**
   * This story will only render a documentation page.
   */
  docsOnly?: boolean
  /**
   * The copyable source code of the story.
   */
  source?: string
  /**
   * Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.
   */
  responsiveDisabled?: boolean
}

declare const VueStoryComponent: import('vue').DefineComponent<
TypePropsToRuntimeProps<VueStoryProps>, {}, unknown, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {}, string, import('vue').VNodeProps & import('vue').AllowedComponentProps & import('vue').ComponentCustomProps, Readonly<import('vue').ExtractPropTypes<TypePropsToRuntimeProps<VueStoryProps>>> & {}, {}
>

// <Variant>

interface VueVariantProps {
  /**
   * Title of the variant.
   */
  title?: string
  /**
   * Id of the variant used in the URL. By default, the id is automatically generated with the index of the variant in the list. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.
   */
  id?: string
  /**
   * Function that returns the intial state.
   */
  initState?: () => Record<string, any>
  /**
   * A function to configure the Vue application.
   */
  setupApp?: (payload: { app: import('vue').App, story: Story, variant: Variant }) => void | Promise<void>
  /**
   * An Iconify id to customize the variant icon in the UI.
   * https://icones.js.org/
   */
  icon?: string
  /**
   * The icon color.
   * Example: `#8B5CF6`
   */
  iconColor?: string
  /**
   * The copyable source code of the variant.
   */
  source?: string
  /**
   * Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.
   */
  responsiveDisabled?: boolean
}

declare const VueVariantComponent: import('vue').DefineComponent<
TypePropsToRuntimeProps<VueVariantProps>, {}, unknown, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {}, string, import('vue').VNodeProps & import('vue').AllowedComponentProps & import('vue').ComponentCustomProps, Readonly<import('vue').ExtractPropTypes<TypePropsToRuntimeProps<VueVariantProps>>> & {}, {}
>

// Register global components

declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    Story: typeof VueStoryComponent
    Variant: typeof VueVariantComponent
    // Controls
    HstButton: typeof HstButton
    HstButtonGroup: typeof HstButtonGroup
    HstCheckbox: typeof HstCheckbox
    HstCheckboxList: typeof HstCheckboxList
    HstText: typeof HstText
    HstNumber: typeof HstNumber
    HstSlider: typeof HstSlider
    HstTextarea: typeof HstTextarea
    HstSelect: typeof HstSelect
    HstRadio: typeof HstRadio
    HstJson: typeof HstJson
    HstColorShades: typeof HstColorShades
    HstTokenList: typeof HstTokenList
    HstTokenGrid: typeof HstTokenGrid
    HstCopyIcon: typeof HstCopyIcon
  }
}

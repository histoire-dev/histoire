import { components } from '@histoire/controls'
import { wrapVueControl } from './wrap-vue-control.js'

/** Generate React facades from the authoritative Vue control registry. */
const controls = Object.fromEntries(Object.entries(components).map(([name, component]) => [name, wrapVueControl(component)])) as Record<keyof typeof components, ReturnType<typeof wrapVueControl>>

/** React wrappers for Histoire's built-in controls, including native Vue listeners. */
export const {
  HstButton,
  HstButtonGroup,
  HstCheckbox,
  HstSwitch,
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
  HstColorSelect,
} = controls
export type { ReactControlProps } from './wrap-vue-control.js'

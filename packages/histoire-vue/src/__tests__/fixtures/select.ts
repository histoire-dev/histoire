import type { VueWrapper } from '@vue/test-utils'
import { HstSelect } from '@histoire/controls/vue'
import { nextTick } from 'vue'

/** Find shared select by its public accessible trigger name. */
export function controlSelect(wrapper: VueWrapper, label = 'State preset') {
  const select = wrapper.findAllComponents(HstSelect).find(control => control.vm.$attrs['aria-label'] === label)
  if (!select) throw new Error(`Missing select: ${label}`)
  return select
}

/** Exercise consumer value contract; menu interaction has dedicated integration coverage. */
export async function selectControl(wrapper: VueWrapper, value: unknown, label = 'State preset'): Promise<void> {
  controlSelect(wrapper, label).vm.$emit('update:modelValue', value)
  await nextTick()
}

/** Read current options without depending on dropdown rendering mode. */
export function selectLabels(wrapper: VueWrapper, label = 'State preset'): string[] {
  return (controlSelect(wrapper, label).props('options') as { label: string }[]).map(option => option.label)
}

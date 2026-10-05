<script setup lang="ts">
import type { HstControlLayout } from '../types'
import { VTooltip as vTooltip } from '../overlay/tooltip'
import { useControlsTheme } from '../utils'

defineOptions({ name: 'HstWrapper', inheritAttrs: false })
withDefaults(defineProps<{
  /** Visible field or group name. */
  title?: string
  /** Optional legacy root element override. */
  tag?: string
  /** Label placement; inline omits label chrome. */
  layout?: HstControlLayout
  /** Native input identity for explicit label association. */
  controlId?: string
}>(), { tag: 'div', layout: 'stacked' })
const dark = useControlsTheme()
</script>

<template>
  <component :is="layout === 'inline' ? 'span' : tag" class="histoire-wrapper" :class="$attrs.class" :style="$attrs.style" :data-layout="layout" :data-histoire-control-appearance="dark ? 'dark' : 'light'" :data-histoire-control-type="$attrs['data-histoire-control-type']" v-bind="Object.fromEntries(Object.entries($attrs).filter(([key]) => !['class', 'style', 'data-histoire-control-type'].includes(key)))">
    <span v-if="layout !== 'inline' && (title || $slots.title || $attrs['data-histoire-control-type'])" class="histoire-control-label">
      <component :is="controlId ? 'label' : 'span'" v-tooltip="{ content: title, placement: 'left', distance: 12 }" :for="controlId" class="histoire-control-title"><slot name="title">{{ title }}</slot></component>
      <span v-if="$attrs['data-histoire-control-type']" class="histoire-control-type">{{ $attrs['data-histoire-control-type'] }}</span>
    </span>
    <span class="histoire-control-content"><span class="histoire-control-value"><slot /></span><span v-if="$slots.actions" class="histoire-control-actions" @click.stop @mousedown.stop @pointerdown.stop><slot name="actions" /></span></span>
  </component>
</template>

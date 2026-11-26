<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { overflowItemKey, overflowToolbarKey } from './context.js'

const props = defineProps<{
  /** Stable identity independent of control label or current position. */
  id: string
  /** Separate this group from preceding group in either presentation. */
  separatorBefore?: boolean
}>()
const toolbar = inject(overflowToolbarKey)
if (!toolbar) throw new Error('BaseOverflowToolbarItem requires BaseOverflowToolbar')
const marker = shallowRef<HTMLElement | null>(null)
const element = shallowRef<HTMLElement | null>(null)
const overflow = ref(false)
const empty = ref(false)
const separator = ref(false)
provide(overflowItemKey, overflow)
let dispose: (() => void) | undefined
onMounted(() => {
  dispose = toolbar.register({ id: props.id, marker, element, overflow, empty, separator, separatorBefore: () => Boolean(props.separatorBefore) })
})
watch(() => props.separatorBefore, toolbar.measure)
onBeforeUnmount(() => dispose?.())
</script>

<template>
  <span ref="marker" class="htw:hidden" aria-hidden="true" />
  <Teleport :disabled="!overflow" :to="toolbar.hosts.get(id) ?? 'body'">
    <div ref="element" class="overflow-toolbar-item htw:group/overflow-item htw:flex htw:flex-none htw:items-center htw:gap-[3px] htw:w-max htw:[&[hidden]]:hidden htw:data-[toolbar-presentation=menu]:flex-col htw:data-[toolbar-presentation=menu]:items-stretch htw:data-[toolbar-presentation=menu]:w-full htw:data-[toolbar-presentation=menu]:gap-0 htw:data-[separator=true]:before:content-[''] htw:before:hidden htw:data-[separator=true]:before:block htw:before:flex-none htw:before:w-px htw:before:h-4 htw:before:mx-[3px] htw:before:bg-border htw:data-[toolbar-presentation=menu]:before:w-auto htw:data-[toolbar-presentation=menu]:before:h-px htw:data-[toolbar-presentation=menu]:before:my-[5px]" :data-toolbar-presentation="overflow ? 'menu' : 'inline'" :data-separator="separator" :hidden="empty">
      <div class="htw:flex htw:items-center htw:gap-[3px] htw:w-max htw:group-data-[toolbar-presentation=menu]/overflow-item:flex-col htw:group-data-[toolbar-presentation=menu]/overflow-item:items-stretch htw:group-data-[toolbar-presentation=menu]/overflow-item:w-full htw:group-data-[toolbar-presentation=menu]/overflow-item:gap-px">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

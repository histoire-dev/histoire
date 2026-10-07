<script lang="ts" setup>
import type { Component } from 'vue'
import type { HstControlLayout } from '../../types'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import HstButton from '../button/HstButton.vue'
import HstWrapper from '../HstWrapper.vue'
import { loadHstJsonEditor } from './HstJsonEditorAsync'

defineOptions({ name: 'HstJson', inheritAttrs: false })

const props = defineProps<{
  /** Shared label placement. */
  layout?: HstControlLayout
  /** Lock editing while retaining external resets and invalid draft ownership. */
  disabled?: boolean
  /** Allow native editor focus without accepting edits. */
  readonly?: boolean
  /** Visible editor label. */
  title?: string
  /** Parsed JSON value; invalid local drafts never replace this state. */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [newValue: unknown]
}>()

interface JsonEditorHandle {
  focus?: () => void
}

const editorInstance = ref<JsonEditorHandle | null>(null)
const editorComponent = shallowRef<Component | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
let mounted = false
let pendingFocus = false
let loadAttempt = 0

/** Load editor chunk and ignore completions from retired attempts. */
function loadEditor(): void {
  const attempt = ++loadAttempt
  loading.value = true
  loadFailed.value = false
  void loadHstJsonEditor().then(({ default: component }) => {
    if (mounted && attempt === loadAttempt) {
      editorComponent.value = component
      loading.value = false
    }
  }).catch(() => {
    if (mounted && attempt === loadAttempt) {
      loading.value = false
      loadFailed.value = true
    }
  })
}

/**
 * Attach lazy editor and deliver queued focus after its mount hook runs.
 * @param instance Public editor instance, or null when its ref is cleared.
 */
function setEditorRef(instance: unknown): void {
  editorInstance.value = instance as JsonEditorHandle | null
  if (!editorInstance.value) return
  if (pendingFocus && mounted && !props.disabled) {
    const requestedInstance = editorInstance.value
    void nextTick().then(() => {
      if (mounted && editorInstance.value === requestedInstance && !props.disabled) {
        requestedInstance.focus?.()
      }
    })
  }
  pendingFocus = false
}

/** Focus loaded editor or remember one request until its chunk mounts. */
function focus(): void {
  if (!mounted || props.disabled) return
  if (editorInstance.value?.focus) {
    editorInstance.value.focus()
  }
  else {
    pendingFocus = true
  }
}

defineExpose({ focus })
onMounted(() => {
  mounted = true
  loadEditor()
})
watch(() => props.disabled, (disabled) => {
  if (disabled) pendingFocus = false
})
onBeforeUnmount(() => {
  mounted = false
  loadAttempt++
  pendingFocus = false
  editorInstance.value = null
})
</script>

<template>
  <component
    :is="editorComponent"
    v-if="editorComponent"
    :ref="setEditorRef"
    v-bind="{ ...$attrs, ...props }"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </component>

  <HstWrapper
    v-else
    :title="title"
    :layout="layout"
    :aria-disabled="disabled || undefined"
    :data-histoire-control-type="$attrs['data-histoire-control-type']"
    class="histoire-json htw-cursor-text"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div class="__histoire-json-code __histoire-json-load-state" v-bind="{ ...$attrs, class: null, style: null }">
      <span v-if="loading" role="status" aria-busy="true">Loading JSON editor…</span>
      <div v-else-if="loadFailed" role="alert" class="__histoire-json-load-error">
        <span>JSON editor failed to load.</span>
        <HstButton color="flat" aria-label="Retry" @click="loadEditor">
          Retry
        </HstButton>
      </div>
    </div>

    <template v-if="$slots['label-actions']" #label-actions>
      <slot name="label-actions" />
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>

<style scoped>
.__histoire-json-load-state {
  display: flex;
  align-items: center;
  justify-content: center;
}

.__histoire-json-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
</style>

<script lang="ts">
export default {
  name: 'HstJson',
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import type {
  ViewUpdate,
} from '@codemirror/view'
import type { HstControlLayout } from '../../types'
import { defaultKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { VTooltip as vTooltip } from '../../overlay/tooltip'
import { useControlsTheme } from '../../utils'
import BuiltinIcon from '../BuiltinIcon.vue'
import HstWrapper from '../HstWrapper.vue'

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

const emit = defineEmits({
  'update:modelValue': (newValue: unknown) => true,
})

const isDark = useControlsTheme()
let editorView: EditorView
const internalValue = ref('')
const invalidValue = ref(false)
const editorElement = ref<HTMLInputElement>()

/** CodeMirror keeps edit semantics while its chrome uses shared control palette. */
const editorTheme = EditorView.theme({
  '&': { color: 'var(--histoire-control-resolved-text)', backgroundColor: 'transparent', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--histoire-font-mono, "JetBrains Mono", monospace)' },
  '.cm-gutters': { color: 'var(--histoire-control-resolved-muted)', backgroundColor: 'var(--histoire-control-resolved-input)', border: '0' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--histoire-control-resolved-chip)' },
  '.cm-content': { caretColor: 'var(--histoire-control-resolved-accent)' },
})
const themes = {
  light: [editorTheme, syntaxHighlighting(defaultHighlightStyle)],
  dark: [editorTheme, syntaxHighlighting(oneDarkHighlightStyle)],
}

const themeConfig = new Compartment()
const availability = new Compartment()

/** Public focus remains bound to existing CodeMirror editor. */
function focus(): void {
  if (!props.disabled) editorView?.focus()
}
defineExpose({ focus })

const extensions = [
  highlightActiveLineGutter(),
  highlightActiveLine(),
  highlightSpecialChars(),
  json(),
  bracketMatching(),
  indentOnInput(),
  foldGutter(),
  keymap.of([
    ...defaultKeymap,
    ...foldKeymap,
    ...lintKeymap,
  ]),
  EditorView.updateListener.of((viewUpdate: ViewUpdate) => {
    internalValue.value = viewUpdate.view.state.doc.toString()
  }),
  themeConfig.of(themes.light),
  availability.of([]),
]

onMounted(() => {
  editorView = new EditorView({
    doc: JSON.stringify(props.modelValue, null, 2),
    extensions,
    parent: editorElement.value,
  })

  watchEffect(() => {
    editorView.dispatch({
      effects: [
        themeConfig.reconfigure(themes[isDark.value ? 'dark' : 'light']),
        availability.reconfigure([
          EditorState.readOnly.of(!!props.disabled || !!props.readonly),
          EditorView.editable.of(!props.disabled && !props.readonly),
          EditorView.contentAttributes.of({ 'aria-label': props.title ?? 'JSON', 'aria-disabled': String(!!props.disabled), 'aria-readonly': String(!!props.readonly), 'tabindex': props.disabled ? '-1' : '0' }),
        ]),
      ],
    })
  })
})

onBeforeUnmount(() => editorView?.destroy())

watch(() => props.modelValue, () => {
  if (!editorView) return
  let sameDocument

  try {
    sameDocument = (JSON.stringify(JSON.parse(internalValue.value)) === JSON.stringify(props.modelValue))
  }
  catch (e) {
    sameDocument = false
  }

  if (!sameDocument) {
    editorView.dispatch({ changes: [{ from: 0, to: editorView.state.doc.length, insert: JSON.stringify(props.modelValue, null, 2) }] })
  }
}, { deep: true })

watch(() => internalValue.value, () => {
  invalidValue.value = false
  try {
    emit('update:modelValue', JSON.parse(internalValue.value))
  }
  catch (e) {
    invalidValue.value = true
  }
})
</script>

<template>
  <HstWrapper
    :title="title"
    :layout="layout"
    :aria-disabled="disabled || undefined"
    :data-histoire-control-type="$attrs['data-histoire-control-type']"
    class="histoire-json htw-cursor-text"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div
      ref="editorElement"
      class="__histoire-json-code"
      v-bind="{ ...$attrs, class: null, style: null }"
    />

    <template v-if="invalidValue || $slots.actions" #actions>
      <BuiltinIcon
        v-if="invalidValue"
        v-tooltip="'JSON error'"
        icon="carbon:warning-alt"
        class="htw-text-orange-500"
      />

      <slot name="actions" />
    </template>
  </HstWrapper>
</template>

<style scoped>
.__histoire-json-code :deep(.cm-editor) {
  height: 100%;
  min-width: 0;
}
</style>

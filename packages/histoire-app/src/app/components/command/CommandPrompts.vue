<script lang="ts" setup>
import { defineAsyncComponent, reactive, ref } from 'vue'
import type { ClientCommand } from '@histoire/shared'
import { getCommandContext, executeCommand } from '../../util/commands.js'
import BaseButton from '../base/BaseButton.vue'
import BaseKeyboardShortcut from '../base/BaseKeyboardShortcut.vue'

const props = defineProps<{
  command: ClientCommand
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const promptTypes = {
  text: defineAsyncComponent(() => import('./PromptText.vue')),
}

const answers = reactive<Record<string, any>>({})

for (const prompt of props.command.prompts) {
  answers[prompt.field] = prompt.defaultValue
}

function submit () {
  const params = props.command.getParams
    ? props.command.getParams({
      ...getCommandContext(),
      answers,
    })
    : answers
  executeCommand(props.command, params)
  emit('close')
}

// Autofocus

const promptComps = ref<any[]>([])

function focusFirstPrompt () {
  requestAnimationFrame(() => {
    promptComps.value[0]?.focus?.()
  })
}
</script>

<template>
  <div>
    <Suspense
      :timeout="0"
      @resolve="focusFirstPrompt()"
    >
      <form
        class="htw-flex htw-flex-col"
        @submit.prevent="submit()"
        @keyup.escape="$emit('close')"
      >
        <div class="htw-p-4 htw-opacity-70">
          {{ command.label }}
        </div>

        <div
          v-for="prompt of command.prompts"
          :key="prompt.field"
          class="hover:htw-bg-gray-500/10 focus-within:htw-bg-gray-500/10"
        >
          <component
            :is="promptTypes[prompt.type]"
            ref="promptComps"
            v-model="answers[prompt.field]"
            :prompt="prompt"
          />
        </div>

        <div class="htw-flex htw-justify-end htw-gap-2 htw-p-2">
          <BaseButton
            type="submit"
            class="htw-px-4 htw-py-2 htw-flex htw-items-start htw-gap-2"
          >
            <BaseKeyboardShortcut
              shortcut="Enter"
            />
            <span>Submit</span>
          </BaseButton>
        </div>
      </form>

      <template #fallback>
        <div class="htw-p-4">
          Loading...
        </div>
      </template>
    </Suspense>
  </div>
</template>
